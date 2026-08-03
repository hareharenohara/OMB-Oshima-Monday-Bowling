create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.members(id) on delete cascade,
  recipient_id uuid not null references public.members(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint direct_messages_different_members check (sender_id <> recipient_id)
);

create index if not exists direct_messages_sender_created_idx
  on public.direct_messages (sender_id, created_at desc);
create index if not exists direct_messages_recipient_created_idx
  on public.direct_messages (recipient_id, created_at desc);

create table if not exists public.direct_message_reads (
  member_id uuid not null references public.members(id) on delete cascade,
  peer_member_id uuid not null references public.members(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (member_id, peer_member_id),
  constraint direct_message_reads_different_members check (member_id <> peer_member_id)
);

alter table public.direct_messages enable row level security;
alter table public.direct_message_reads enable row level security;

revoke all on public.direct_messages from anon;
revoke all on public.direct_message_reads from anon;
grant select, insert, delete on public.direct_messages to authenticated;
grant select, insert, update on public.direct_message_reads to authenticated;

create policy "participants can read direct messages"
  on public.direct_messages for select to authenticated
  using (exists (
    select 1 from public.members me
    where me.auth_user_id = (select auth.uid())
      and me.status = '在籍'
      and me.id in (sender_id, recipient_id)
  ));

create policy "active members can send direct messages"
  on public.direct_messages for insert to authenticated
  with check (
    exists (
      select 1 from public.members me
      where me.id = sender_id
        and me.auth_user_id = (select auth.uid())
        and me.status = '在籍'
    )
    and exists (
      select 1 from public.members recipient
      where recipient.id = recipient_id and recipient.status = '在籍'
    )
  );

create policy "senders can delete own direct messages"
  on public.direct_messages for delete to authenticated
  using (exists (
    select 1 from public.members me
    where me.id = sender_id and me.auth_user_id = (select auth.uid())
  ));

create policy "members can read own direct markers"
  on public.direct_message_reads for select to authenticated
  using (exists (
    select 1 from public.members me
    where me.id = member_id and me.auth_user_id = (select auth.uid())
  ));

create policy "members can create own direct markers"
  on public.direct_message_reads for insert to authenticated
  with check (exists (
    select 1 from public.members me
    where me.id = member_id and me.auth_user_id = (select auth.uid())
  ));

create policy "members can update own direct markers"
  on public.direct_message_reads for update to authenticated
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
      and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end $$;
