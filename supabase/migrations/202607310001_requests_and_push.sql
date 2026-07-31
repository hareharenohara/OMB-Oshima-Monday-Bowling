-- OMB 承認申請・Web Push補完マイグレーション
alter table public.requests add column if not exists packs integer;
alter table public.requests add column if not exists payment_method text;
alter table public.requests add column if not exists note text;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "members manage own push subscriptions" on public.push_subscriptions;
create policy "members manage own push subscriptions"
on public.push_subscriptions for all to authenticated
using (member_id in (select id from public.members where auth_user_id = auth.uid()))
with check (member_id in (select id from public.members where auth_user_id = auth.uid()));

create index if not exists push_subscriptions_member_id_idx
on public.push_subscriptions(member_id);

alter table public.requests drop constraint if exists requests_type_check;
alter table public.requests add constraint requests_type_check
check (type in ('score', 'purchase', 'return'));

alter table public.requests drop constraint if exists requests_packs_check;
alter table public.requests add constraint requests_packs_check
check (packs is null or packs > 0);

alter table public.requests drop constraint if exists requests_payment_method_check;
alter table public.requests add constraint requests_payment_method_check
check (payment_method is null or payment_method in ('cash', 'ticket'));
