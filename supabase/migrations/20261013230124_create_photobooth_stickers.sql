-- Public sticker catalog. User-created content and photos remain in the browser.
create table if not exists public.photobooth_stickers (
  id text primary key,
  name text not null check (char_length(name) between 1 and 80),
  category text not null check (category in ('cute', 'text', 'nature', 'shapes', 'lucky', 'retro')),
  tags text[] not null default '{}',
  asset_path text not null,
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint photobooth_stickers_asset_path_safe check (
    asset_path !~ '(^|/)\.\.?(/|$)' and asset_path !~ '^/'
  )
);

alter table public.photobooth_stickers enable row level security;

grant select on table public.photobooth_stickers to anon, authenticated;
grant insert, update, delete on table public.photobooth_stickers to authenticated;

create policy "Published stickers are readable"
on public.photobooth_stickers for select
to anon, authenticated
using (is_published = true);

create policy "Admins can create stickers"
on public.photobooth_stickers for insert
to authenticated
with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins can update stickers"
on public.photobooth_stickers for update
to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins can delete stickers"
on public.photobooth_stickers for delete
to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photobooth-stickers',
  'photobooth-stickers',
  true,
  1048576,
  array['image/png', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Admins can upload sticker assets"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'photobooth-stickers'
  and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
  and storage.extension(name) in ('png', 'webp', 'svg')
);

create policy "Admins can update sticker assets"
on storage.objects for update
to authenticated
using (
  bucket_id = 'photobooth-stickers'
  and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
)
with check (
  bucket_id = 'photobooth-stickers'
  and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
  and storage.extension(name) in ('png', 'webp', 'svg')
);

create policy "Admins can delete sticker assets"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'photobooth-stickers'
  and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
);

