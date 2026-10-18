create table if not exists public.photobooth_album_upload_events (
  id uuid primary key default gen_random_uuid(),
  client_hash text not null,
  album_id uuid references public.photobooth_albums(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint photobooth_album_upload_events_hash_length check (char_length(client_hash) = 64)
);

create index if not exists photobooth_album_upload_events_client_time_idx
  on public.photobooth_album_upload_events (client_hash, created_at desc);

alter table public.photobooth_album_upload_events enable row level security;
revoke all on table public.photobooth_album_upload_events from anon, authenticated;
