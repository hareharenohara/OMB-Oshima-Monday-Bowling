-- Temporarily remove the per-user scan cap. Keep the historical usage records.
drop trigger if exists enforce_daily_score_scan_limit on public.score_scan_usage;

create table public.score_scan_jobs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  context_key text not null,
  request_date text,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed')),
  result jsonb,
  current_model text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.score_scan_jobs enable row level security;
revoke all on public.score_scan_jobs from public, anon, authenticated;
grant select on public.score_scan_jobs to authenticated;
grant all on public.score_scan_jobs to service_role;
create policy score_scan_jobs_read_own on public.score_scan_jobs for select to authenticated
  using (user_id = (select auth.uid()));
create index score_scan_jobs_user_idx on public.score_scan_jobs(user_id);
create index score_scan_jobs_due_idx on public.score_scan_jobs(next_attempt_at) where status <> 'completed';

-- Preserve an idempotency key on the final submission and remove its draft atomically.
alter table public.requests add column scan_job_id uuid;
create unique index requests_scan_job_unique on public.requests(scan_job_id) where scan_job_id is not null;
create function public.finish_score_scan_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.scan_job_id is not null then
    if auth.uid() is null or not exists (
      select 1 from public.score_scan_jobs where id = new.scan_job_id
        and user_id = auth.uid() and status = 'completed'
    ) then raise exception 'score_scan_not_ready'; end if;
    delete from public.score_scan_jobs where id = new.scan_job_id and user_id = auth.uid();
  end if;
  return new;
end;
$$;
revoke all on function public.finish_score_scan_submission() from public, anon, authenticated;
create trigger finish_score_scan_submission after insert on public.requests
for each row execute function public.finish_score_scan_submission();

-- Atomic claim and expiring lease recover even if an Edge Function is terminated.
create function public.claim_score_scan_jobs(p_id uuid default null)
returns setof public.score_scan_jobs language sql set search_path = '' as $$
  update public.score_scan_jobs j
  set status = 'processing', current_model = null, attempts = attempts + 1, next_attempt_at = now() + interval '5 minutes'
  where j.id in (
    select id from public.score_scan_jobs
    where status <> 'completed' and next_attempt_at <= now() and (p_id is null or id = p_id)
    order by next_attempt_at for update skip locked limit 3
  ) returning j.*;
$$;
revoke all on function public.claim_score_scan_jobs(uuid) from public, anon, authenticated;
grant execute on function public.claim_score_scan_jobs(uuid) to service_role;

select vault.create_secret(gen_random_uuid()::text, 'score_scan_worker_token');
create function public.verify_score_scan_worker(p_token text)
returns boolean language sql security definer set search_path = '' as $$
  select exists(select 1 from vault.decrypted_secrets
    where name = 'score_scan_worker_token' and decrypted_secret = p_token);
$$;
revoke all on function public.verify_score_scan_worker(text) from public, anon, authenticated;
grant execute on function public.verify_score_scan_worker(text) to service_role;

select cron.schedule('retry-score-scans', '* * * * *', $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/scan-bowling-slip',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-scan-worker-token', (select decrypted_secret from vault.decrypted_secrets where name = 'score_scan_worker_token')),
    body := '{"worker":true}'::jsonb, timeout_milliseconds := 1000
  );
$cron$);
