create policy "clients cannot access reminder deliveries"
  on public.schedule_reminder_deliveries
  for all to authenticated
  using (false)
  with check (false);
