-- Run after the durable_score_scan_retries migration; all fixtures are rolled back.
begin;
do $test$
declare test_id uuid := gen_random_uuid(); test_user uuid; n integer;
begin
  select id into test_user from auth.users limit 1;
  if test_user is null then raise exception 'Test requires an existing auth user'; end if;
  insert into public.score_scan_jobs(id,user_id,context_key,payload) values(test_id,test_user,'test','{}');
  select count(*) into n from public.claim_score_scan_jobs(test_id);
  if n <> 1 then raise exception 'claim failed'; end if;
  select count(*) into n from public.claim_score_scan_jobs(test_id);
  if n <> 0 then raise exception 'duplicate claim'; end if;
  update public.score_scan_jobs set next_attempt_at=now()-interval '1 minute' where id=test_id;
  select count(*) into n from public.claim_score_scan_jobs(test_id);
  if n <> 1 then raise exception 'lease recovery failed'; end if;
  update public.score_scan_jobs set status='completed',next_attempt_at=now()-interval '1 minute' where id=test_id;
  select count(*) into n from public.claim_score_scan_jobs(test_id);
  if n <> 0 then raise exception 'completed job reclaimed'; end if;
  if public.verify_score_scan_worker('invalid-token') then raise exception 'worker auth failed'; end if;
  if has_table_privilege('anon','public.score_scan_jobs','select') then raise exception 'anonymous access'; end if;
  if has_table_privilege('authenticated','public.score_scan_jobs','insert') then raise exception 'client mutation access'; end if;
  if has_function_privilege('authenticated','public.claim_score_scan_jobs(uuid)','execute') then raise exception 'claim access'; end if;
  perform set_config('request.jwt.claim.sub', test_user::text, true);
  set local role authenticated;
  select count(*) into n from public.score_scan_jobs where id=test_id;
  if n <> 1 then raise exception 'owner cannot read job'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  set local role authenticated;
  select count(*) into n from public.score_scan_jobs where id=test_id;
  if n <> 0 then raise exception 'other user can read job'; end if;
  reset role;
end $test$;
select 'claim, lease recovery, completed exclusion, worker authentication, grants, owner RLS: passed' as verification;
rollback;
