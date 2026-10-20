-- Public frame catalog for the Photobooth app. User photos never enter Supabase.
create table if not exists public.photobooth_frames (
  id text primary key,
  name text not null check (char_length(name) between 1 and 80),
  description text,
  config jsonb not null default '{}'::jsonb,
  asset_path text,
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint photobooth_frames_asset_path_safe check (
    asset_path is null or (asset_path !~ '(^|/)\.\.?(/|$)' and asset_path !~ '^/')
  )
);

alter table public.photobooth_frames enable row level security;

grant select on table public.photobooth_frames to anon, authenticated;
grant insert, update, delete on table public.photobooth_frames to authenticated;

create policy "Published frames are readable"
on public.photobooth_frames for select
to anon, authenticated
using (is_published = true);

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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photobooth-frames',
  'photobooth-frames',
  true,
  5242880,
  array['image/png', 'image/svg+xml', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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

insert into public.photobooth_frames (id, name, description, config, is_published, sort_order)
values
  ('paper', 'Giấy trắng', 'Sạch và tối giản', '{"background":"#fffdf8","accent":"#e85d44","textColor":"#25221f","radius":24}', true, 10),
  ('midnight', 'Đêm đen', 'Tương phản và điện ảnh', '{"background":"#171717","accent":"#f4c95d","textColor":"#fff8ef","radius":20}', true, 20),
  ('cream', 'Kem bơ', 'Ấm áp và hoài cổ', '{"background":"#f6e7c9","accent":"#a65a3a","textColor":"#4b382a","radius":18}', true, 30),
  ('blush', 'Hồng phấn', 'Dịu dàng và vui tươi', '{"background":"#f9dbe4","accent":"#d44872","textColor":"#61283a","radius":28}', true, 40),
  ('lavender', 'Oải hương', 'Mơ màng, nhẹ nhàng', '{"background":"#e8e0f6","accent":"#7654a8","textColor":"#382653","radius":28}', true, 50),
  ('film', 'Cuộn phim', 'Viền phim cổ điển', '{"background":"#1f1b18","accent":"#f0a34a","textColor":"#f8ead7","radius":8}', true, 60)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  config = excluded.config,
  is_published = excluded.is_published,
  sort_order = excluded.sort_order,
  updated_at = now();

