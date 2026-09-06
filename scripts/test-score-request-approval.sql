-- Run against the migrated DB. All fixtures are rolled back, including on failure.
begin;
do $$
declare
  test_member uuid;
  admin_user uuid;
  payload jsonb;
  request_id uuid;
begin
  select auth_user_id into strict admin_user from public.members
    where role = 'admin' and status = '在籍' and auth_user_id is not null limit 1;
  perform set_config('request.jwt.claim.sub', admin_user::text, true);
  insert into public.members(name) values ('__score_approval_rollback_test__') returning id into test_member;
  perform set_config('test.member_id', test_member::text, true);
  select jsonb_agg(jsonb_build_object('game_number', n, 'score', 120, 'frames',
    jsonb_build_array(jsonb_build_object('throws', jsonb_build_array('X'), 'score', 20, 'is_split', false))))
    into payload from generate_series(1,6) n;
  insert into public.requests(type, member_id, date, games) values ('score', test_member, '2099-01-01', payload)
    returning id into request_id;
  perform set_config('test.six_id', request_id::text, true);
  select jsonb_agg(value) into payload from jsonb_array_elements(payload) with ordinality where ordinality <= 3;
  insert into public.requests(type, member_id, date, games) values ('score', test_member, '2099-01-02', payload)
    returning id into request_id;
  perform set_config('test.first_id', request_id::text, true);
  insert into public.requests(type, member_id, date, games) values ('score', test_member, '2099-01-02', payload)
    returning id into request_id;
  perform set_config('test.second_id', request_id::text, true);
  insert into public.requests(type, member_id, date, games) values ('score', test_member, '2099-01-02',
    '[{"score":100},{"score":301}]'::jsonb) returning id into request_id;
  perform set_config('test.invalid_id', request_id::text, true);
end $$;
set local role authenticated;
do $$
declare
  result jsonb;
  test_member uuid := current_setting('test.member_id')::uuid;
begin
  perform public.approve_score_request(current_setting('test.six_id')::uuid);
  perform public.approve_score_request(current_setting('test.first_id')::uuid);
  perform public.approve_score_request(current_setting('test.second_id')::uuid);
  result := public.approve_score_request(current_setting('test.second_id')::uuid);
  if (result->>'already_approved')::boolean is not true then raise exception 'Retry not idempotent'; end if;
  if (select count(*) from public.sessions where member_id = test_member and game_count = 6) <> 2 then
    raise exception '6G or 3G+3G failed';
  end if;
  if (select count(*) from public.games g join public.sessions s on s.id=g.session_id where s.member_id=test_member) <> 12 then
    raise exception 'Incorrect game count';
  end if;
  if (select count(*) from public.frames f join public.games g on g.id=f.game_id join public.sessions s on s.id=g.session_id where s.member_id=test_member) <> 12 then
    raise exception 'Frames were lost';
  end if;
  begin
    perform public.approve_score_request(current_setting('test.invalid_id')::uuid);
    raise exception 'Invalid score accepted';
  exception when check_violation then null;
  end;
  if (select status from public.requests where id=current_setting('test.invalid_id')::uuid) <> 'pending'
    or (select game_count from public.sessions where member_id=test_member and date='2099-01-02') <> 6 then
    raise exception 'Failed approval was not rolled back';
  end if;
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  begin
    perform public.approve_score_request(current_setting('test.six_id')::uuid);
    raise exception 'Non-admin accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
select 'PASS: 6G, 3G+3G, frames, retry, rollback, non-admin denial' as result;
