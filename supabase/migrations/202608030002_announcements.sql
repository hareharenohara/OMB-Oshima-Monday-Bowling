-- 管理者からメンバー全員へのお知らせ
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 5000),
  priority text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  is_pinned boolean not null default false,
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid not null references public.members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_expiry_check check (expires_at is null or expires_at > publish_at)
);

create index if not exists announcements_visible_order_idx
  on public.announcements (is_pinned desc, publish_at desc);
create index if not exists announcements_created_by_idx
  on public.announcements (created_by);

alter table public.announcements enable row level security;

revoke all on table public.announcements from anon;
grant select, insert, update, delete on table public.announcements to authenticated;

drop policy if exists announcements_select_members on public.announcements;
create policy announcements_select_members
on public.announcements for select to authenticated
using (
  (select public.is_admin())
  or (
    status = 'published'
    and publish_at <= now()
    and (expires_at is null or expires_at > now())
  )
);

drop policy if exists announcements_insert_admin on public.announcements;
create policy announcements_insert_admin
on public.announcements for insert to authenticated
with check (
  (select public.is_admin())
  and created_by in (
    select members.id from public.members
    where members.auth_user_id = (select auth.uid())
      and members.role = 'admin'
      and members.status = '在籍'
  )
);

drop policy if exists announcements_update_admin on public.announcements;
create policy announcements_update_admin
on public.announcements for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists announcements_delete_admin on public.announcements;
create policy announcements_delete_admin
on public.announcements for delete to authenticated
using ((select public.is_admin()));
