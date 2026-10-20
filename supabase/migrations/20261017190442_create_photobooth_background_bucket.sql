insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photobooth-background',
  'photobooth-background',
  true,
  8388608,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view photobooth backgrounds" on storage.objects;
drop policy if exists "Admins can upload photobooth backgrounds" on storage.objects;
drop policy if exists "Admins can update photobooth backgrounds" on storage.objects;
drop policy if exists "Admins can delete photobooth backgrounds" on storage.objects;

create policy "Public can view photobooth backgrounds"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'photobooth-background');

create policy "Admins can upload photobooth backgrounds"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'photobooth-background'
  and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
  and storage.extension(name) in ('png', 'jpg', 'jpeg', 'webp')
);

create policy "Admins can update photobooth backgrounds"
on storage.objects for update
to authenticated
using (
  bucket_id = 'photobooth-background'
  and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
)
with check (
  bucket_id = 'photobooth-background'
  and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
  and storage.extension(name) in ('png', 'jpg', 'jpeg', 'webp')
);

create policy "Admins can delete photobooth backgrounds"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'photobooth-background'
  and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
);

