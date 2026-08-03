create table if not exists public.notification_preferences (
  member_id uuid primary key references public.members(id) on delete cascade,
  push_enabled boolean not null default true,
  announcements boolean not null default true,
  group_chat boolean not null default true,
  direct_messages boolean not null default true,
  schedule_reminders boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.schedule_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  schedule_event_id uuid not null references public.schedule_events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('due_soon', 'overdue')),
  sent_at timestamptz not null default now(),
  unique (schedule_event_id, member_id, reminder_type)
);

alter table public.notification_preferences enable row level security;
alter table public.schedule_reminder_deliveries enable row level security;

revoke all on public.notification_preferences from anon;
revoke all on public.schedule_reminder_deliveries from anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;

create policy "members can read own notification preferences"
  on public.notification_preferences for select to authenticated
  using (exists (
    select 1 from public.members me
    where me.id = member_id and me.auth_user_id = (select auth.uid())
  ));

create policy "members can create own notification preferences"
  on public.notification_preferences for insert to authenticated
  with check (exists (
    select 1 from public.members me
    where me.id = member_id and me.auth_user_id = (select auth.uid())
  ));

create policy "members can update own notification preferences"
  on public.notification_preferences for update to authenticated
  using (exists (
    select 1 from public.members me
    where me.id = member_id and me.auth_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.members me
    where me.id = member_id and me.auth_user_id = (select auth.uid())
  ));
