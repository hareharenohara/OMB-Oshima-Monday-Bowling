-- 開催予定とメンバーの出欠回答
create table if not exists public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  event_type text not null default 'bowling' check (event_type in ('bowling', 'tournament', 'social', 'other')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text not null default '' check (char_length(location) <= 200),
  details text not null default '' check (char_length(details) <= 3000),
  response_deadline timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_by uuid not null references public.members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_events_end_check check (ends_at is null or ends_at > starts_at),
  constraint schedule_events_deadline_check check (response_deadline is null or response_deadline <= starts_at)
);

create table if not exists public.schedule_responses (
  event_id uuid not null references public.schedule_events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  response text not null check (response in ('attending', 'absent', 'maybe')),
  comment text not null default '' check (char_length(comment) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

create index if not exists schedule_events_starts_at_idx on public.schedule_events (starts_at);
create index if not exists schedule_events_created_by_idx on public.schedule_events (created_by);
create index if not exists schedule_responses_member_id_idx on public.schedule_responses (member_id);

alter table public.schedule_events enable row level security;
alter table public.schedule_responses enable row level security;
revoke all on table public.schedule_events, public.schedule_responses from anon;
grant select, insert, update, delete on table public.schedule_events, public.schedule_responses to authenticated;

create policy schedule_events_select_members on public.schedule_events for select to authenticated using (true);
create policy schedule_events_insert_admin on public.schedule_events for insert to authenticated
with check (
  (select public.is_admin()) and created_by in (
    select members.id from public.members where members.auth_user_id = (select auth.uid()) and members.role = 'admin' and members.status = '在籍'
  )
);
create policy schedule_events_update_admin on public.schedule_events for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy schedule_events_delete_admin on public.schedule_events for delete to authenticated using ((select public.is_admin()));

create policy schedule_responses_select_members on public.schedule_responses for select to authenticated using (true);
create policy schedule_responses_insert_own on public.schedule_responses for insert to authenticated
with check (
  member_id in (select members.id from public.members where members.auth_user_id = (select auth.uid()) and members.status = '在籍')
  and exists (select 1 from public.schedule_events where schedule_events.id = event_id and schedule_events.status = 'scheduled' and (schedule_events.response_deadline is null or schedule_events.response_deadline >= now()))
);
create policy schedule_responses_update_own on public.schedule_responses for update to authenticated
using (member_id in (select members.id from public.members where members.auth_user_id = (select auth.uid()) and members.status = '在籍'))
with check (
  member_id in (select members.id from public.members where members.auth_user_id = (select auth.uid()) and members.status = '在籍')
  and exists (select 1 from public.schedule_events where schedule_events.id = event_id and schedule_events.status = 'scheduled' and (schedule_events.response_deadline is null or schedule_events.response_deadline >= now()))
);
