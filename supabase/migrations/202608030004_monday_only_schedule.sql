-- OMBは月曜日開催のため、日本時間の月曜日だけを登録する。
alter table public.schedule_events
  add constraint schedule_events_monday_check
  check (extract(isodow from starts_at at time zone 'Asia/Tokyo') = 1);

-- 同じ月曜日の予定は1件に限定する。
create unique index schedule_events_jst_date_unique_idx
  on public.schedule_events (((starts_at at time zone 'Asia/Tokyo')::date));
