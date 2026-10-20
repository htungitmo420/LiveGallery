drop policy if exists "Admins can create frames" on public.photobooth_frames;
drop policy if exists "Admins can update frames" on public.photobooth_frames;
drop policy if exists "Admins can delete frames" on public.photobooth_frames;

create policy "Admins can create frames"
on public.photobooth_frames for insert
to authenticated
with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins can update frames"
on public.photobooth_frames for update
to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins can delete frames"
on public.photobooth_frames for delete
to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admins can upload frame assets" on storage.objects;
drop policy if exists "Admins can update frame assets" on storage.objects;
drop policy if exists "Admins can delete frame assets" on storage.objects;

create policy "Admins can upload frame assets"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'photobooth-frames'
  and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
  and storage.extension(name) in ('png', 'svg', 'webp')
);

create policy "Admins can update frame assets"
on storage.objects for update
to authenticated
using (
  bucket_id = 'photobooth-frames'
  and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
)
with check (
  bucket_id = 'photobooth-frames'
  and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
  and storage.extension(name) in ('png', 'svg', 'webp')
);

create policy "Admins can delete frame assets"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'photobooth-frames'
  and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
);

