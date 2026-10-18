create table if not exists public.photobooth_albums (
  id uuid primary key default gen_random_uuid(),
  share_code text not null unique
    default lower(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 12)),
  title text not null default 'Khoảnh khắc của bạn',
  message text,
  status text not null default 'draft',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint photobooth_albums_share_code_format
    check (share_code ~ '^[a-z0-9_-]{6,64}$'),
  constraint photobooth_albums_title_length
    check (char_length(title) between 1 and 120),
  constraint photobooth_albums_message_length
    check (message is null or char_length(message) <= 500),
  constraint photobooth_albums_status
    check (status in ('draft', 'published', 'archived'))
);

create table if not exists public.photobooth_album_assets (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.photobooth_albums(id) on delete cascade,
  kind text not null,
  storage_path text not null,
  thumbnail_path text,
  mime_type text not null,
  file_name text not null,
  sort_order integer not null default 0,
  width integer,
  height integer,
  duration_ms integer,
  byte_size bigint,
  created_at timestamptz not null default now(),
  constraint photobooth_album_assets_kind check (kind in ('image', 'gif', 'video')),
  constraint photobooth_album_assets_storage_path check (storage_path !~ '(^/|\.\.)'),
  constraint photobooth_album_assets_thumbnail_path check (thumbnail_path is null or thumbnail_path !~ '(^/|\.\.)'),
  constraint photobooth_album_assets_sort_order check (sort_order >= 0),
  constraint photobooth_album_assets_dimensions check (
    (width is null or width > 0)
    and (height is null or height > 0)
    and (duration_ms is null or duration_ms >= 0)
    and (byte_size is null or byte_size >= 0)
  ),
  unique (album_id, sort_order)
);

create index if not exists photobooth_album_assets_album_order_idx
  on public.photobooth_album_assets (album_id, sort_order);

create index if not exists photobooth_albums_published_code_idx
  on public.photobooth_albums (share_code)
  where status = 'published';

alter table public.photobooth_albums enable row level security;
alter table public.photobooth_album_assets enable row level security;

revoke all on table public.photobooth_albums from anon, authenticated;
revoke all on table public.photobooth_album_assets from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photobooth-albums',
  'photobooth-albums',
  false,
  104857600,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
