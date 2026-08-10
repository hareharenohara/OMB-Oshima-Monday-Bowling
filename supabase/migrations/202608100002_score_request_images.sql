alter table public.requests add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('score-request-images', 'score-request-images', false, 10000000, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "score_request_images_insert_own" on storage.objects;
create policy "score_request_images_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'score-request-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "score_request_images_select_authorized" on storage.objects;
create policy "score_request_images_select_authorized" on storage.objects for select to authenticated
using (bucket_id = 'score-request-images' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));

drop policy if exists "score_request_images_delete_own" on storage.objects;
create policy "score_request_images_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'score-request-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create index if not exists requests_image_cleanup_idx on public.requests (created_at) where image_path is not null;
