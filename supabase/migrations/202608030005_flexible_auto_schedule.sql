-- 定例の月曜会と、曜日を問わない臨時予定を併用する。
alter table public.schedule_events drop constraint if exists schedule_events_monday_check;
drop index if exists public.schedule_events_jst_date_unique_idx;

alter table public.schedule_events add column if not exists recurrence_key text;
alter table public.schedule_events add constraint schedule_events_recurrence_key_unique unique (recurrence_key);

-- 旧版が作成した「月曜コンペ」の回答を、同日の「月曜会」へ引き継ぐ。
insert into public.schedule_responses (event_id, member_id, response, comment, created_at, updated_at)
select target.id, response.member_id, response.response, response.comment, response.created_at, response.updated_at
from public.schedule_events old_event
join public.schedule_responses response on response.event_id = old_event.id
join public.schedule_events target
  on target.recurrence_key = 'monday-' || ((old_event.starts_at at time zone 'Asia/Tokyo')::date)::text
where old_event.recurrence_key is null and old_event.title = '月曜コンペ'
on conflict (event_id, member_id) do update
set response = excluded.response, comment = excluded.comment, updated_at = excluded.updated_at;

delete from public.schedule_events old_event
where old_event.recurrence_key is null
  and old_event.title = '月曜コンペ'
  and exists (
    select 1 from public.schedule_events target
    where target.recurrence_key = 'monday-' || ((old_event.starts_at at time zone 'Asia/Tokyo')::date)::text
  );
