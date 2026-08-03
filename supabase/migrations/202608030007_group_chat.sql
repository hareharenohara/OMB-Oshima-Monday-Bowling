create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists group_messages_created_at_idx
  on public.group_messages (created_at desc);

create table if not exists public.group_chat_reads (
  member_id uuid primary key references public.members(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.group_messages enable row level security;
alter table public.group_chat_reads enable row level security;

revoke all on public.group_messages from anon;
revoke all on public.group_chat_reads from anon;
grant select, insert, delete on public.group_messages to authenticated;
grant select, insert, update on public.group_chat_reads to authenticated;

drop policy if exists "active members can read group messages" on public.group_messages;
create policy "active members can read group messages"
  on public.group_messages for select to authenticated
  using (exists (
    select 1 from public.members m
    where m.auth_user_id = (select auth.uid()) and m.status = '在籍'
  ));

drop policy if exists "active members can post own group messages" on public.group_messages;
create policy "active members can post own group messages"
  on public.group_messages for insert to authenticated
  with check (exists (
    select 1 from public.members m
    where m.id = member_id
      and m.auth_user_id = (select auth.uid())
      and m.status = '在籍'
  ));

drop policy if exists "authors and admins can delete group messages" on public.group_messages;
create policy "authors and admins can delete group messages"
  on public.group_messages for delete to authenticated
  using (
    exists (
      select 1 from public.members m
      where m.id = member_id and m.auth_user_id = (select auth.uid())
    )
    or (select public.is_admin())
  );

drop policy if exists "members can read own chat marker" on public.group_chat_reads;
create policy "members can read own chat marker"
  on public.group_chat_reads for select to authenticated
  using (exists (
    select 1 from public.members m
    where m.id = member_id and m.auth_user_id = (select auth.uid())
  ));

drop policy if exists "members can create own chat marker" on public.group_chat_reads;
create policy "members can create own chat marker"
  on public.group_chat_reads for insert to authenticated
  with check (exists (
    select 1 from public.members m
    where m.id = member_id and m.auth_user_id = (select auth.uid())
  ));

drop policy if exists "members can update own chat marker" on public.group_chat_reads;
create policy "members can update own chat marker"
  on public.group_chat_reads for update to authenticated
  using (exists (
    select 1 from public.members m
    where m.id = member_id and m.auth_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.members m
    where m.id = member_id and m.auth_user_id = (select auth.uid())
  ));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'group_messages'
  ) then
    alter publication supabase_realtime add table public.group_messages;
  end if;
end $$;
