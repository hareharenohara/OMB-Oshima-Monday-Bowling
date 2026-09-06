-- Allow 6+ games and multiple slips for the same playing date.
alter table public.sessions drop constraint sessions_game_count_check;
alter table public.sessions add constraint sessions_game_count_check check (game_count >= 1);
alter table public.games drop constraint games_game_number_check;
alter table public.games add constraint games_game_number_check check (game_number >= 1);
drop index if exists public.requests_score_pending_unique;

-- Row locks serialize approvals. All game/frame writes and the decision commit
-- together; retrying an already approved request cannot append it twice.
create or replace function public.approve_score_request(p_request_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.requests%rowtype;
  s public.sessions%rowtype;
  admin_id uuid;
  item jsonb;
  frame jsonb;
  new_game_id uuid;
  offset_number integer;
  item_number integer := 0;
  frame_number_value integer;
  added integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception '管理者のみ承認できます' using errcode = '42501';
  end if;
  select id into admin_id from public.members where auth_user_id = auth.uid();
  select * into r from public.requests where id = p_request_id for update;
  if not found or r.type <> 'score' then
    raise exception 'スコア申請が見つかりません';
  end if;
  if r.status = 'approved' then
    return jsonb_build_object('member_id', r.member_id, 'already_approved', true);
  end if;
  if r.status <> 'pending' then
    raise exception '承認待ちの申請ではありません';
  end if;
  if r.date is null or jsonb_typeof(r.games) is distinct from 'array' then
    raise exception '申請の日付またはゲーム内容が不正です';
  end if;
  added := jsonb_array_length(r.games);
  if added < 1 then raise exception 'ゲームがありません'; end if;

  insert into public.sessions (member_id, date, game_count)
    values (r.member_id, r.date, added)
    on conflict (member_id, date) do nothing;
  select * into strict s from public.sessions
    where member_id = r.member_id and date = r.date for update;
  select coalesce(max(game_number), 0) into offset_number
    from public.games where session_id = s.id;
  -- Existing game numbers remain intact; new slips continue after the last one.
  update public.sessions set game_count = offset_number + added, updated_at = now()
    where id = s.id;
  for item in select value from jsonb_array_elements(r.games) loop
    item_number := item_number + 1;
    insert into public.games (session_id, game_number, score)
      values (s.id, offset_number + item_number, (item->>'score')::integer)
      returning id into new_game_id;
    frame_number_value := 0;
    for frame in select value from jsonb_array_elements(coalesce(item->'frames', '[]'::jsonb)) loop
      frame_number_value := frame_number_value + 1;
      insert into public.frames (game_id, frame_number, throws, score, is_split)
        values (new_game_id, frame_number_value,
          array(select jsonb_array_elements_text(coalesce(frame->'throws', '[]'::jsonb))),
          nullif(frame->>'score', '')::integer,
          coalesce((frame->>'is_split')::boolean, false));
    end loop;
  end loop;
  update public.requests set status = 'approved', decided_at = now(), decided_by = admin_id
    where id = r.id;
  return jsonb_build_object('member_id', r.member_id, 'already_approved', false,
    'session_id', s.id, 'added_games', added);
end;
$$;
revoke all on function public.approve_score_request(uuid) from public, anon;
grant execute on function public.approve_score_request(uuid) to authenticated;
