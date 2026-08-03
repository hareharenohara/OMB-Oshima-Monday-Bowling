create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(
  'https://fbzqvortdzfpxxhvjrkz.supabase.co',
  'project_url',
  'Supabase project URL for scheduled Edge Functions'
);
select vault.create_secret(
  'sb_publishable_07HUXG1yjwBtmpGNvNY5kA_vOAAv9pv',
  'publishable_key',
  'Publishable key for scheduled Edge Functions'
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'send-schedule-response-reminders';

select cron.schedule(
  'send-schedule-response-reminders',
  '0 * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-schedule-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key')
      ),
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 30000
    );
  $cron$
);
