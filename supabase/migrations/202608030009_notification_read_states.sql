create table if not exists public.notification_read_states (
  member_id uuid not null references public.members(id) on delete cascade,
  category text not null check (category in ('announcements')),
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (member_id, category)
);

alter table public.notification_read_states enable row level security;
revoke all on public.notification_read_states from anon;
grant select, insert, update on public.notification_read_states to authenticated;

create policy "members can read own notification state"
  on public.notification_read_states for select to authenticated
  using (exists (
    select 1 from public.members me
    where me.id = member_id and me.auth_user_id = (select auth.uid())
  ));

create policy "members can create own notification state"
  on public.notification_read_states for insert to authenticated
  with check (exists (
    select 1 from public.members me
    where me.id = member_id and me.auth_user_id = (select auth.uid())
  ));

create policy "members can update own notification state"
  on public.notification_read_states for update to authenticated
  using (exists (
    select 1 from public.members me
    where me.id = member_id and me.auth_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.members me
    where me.id = member_id and me.auth_user_id = (select auth.uid())
  ));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'announcements'
  ) then
    alter publication supabase_realtime add table public.announcements;
  end if;
end $$;
