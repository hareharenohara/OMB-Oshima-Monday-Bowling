-- 今後の予定は開催開始時刻まで回答を受け付ける。
update public.schedule_events
set response_deadline = starts_at,
    updated_at = now()
where status = 'scheduled'
  and starts_at > now()
  and response_deadline is distinct from starts_at;

alter table public.schedule_reminder_deliveries
drop constraint if exists schedule_reminder_deliveries_reminder_type_check;

alter table public.schedule_reminder_deliveries
add constraint schedule_reminder_deliveries_reminder_type_check
check (reminder_type in ('due_soon', 'overdue', 'event_day'));
