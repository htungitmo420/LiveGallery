create index if not exists photobooth_album_assets_r2_bytes_idx
  on public.photobooth_album_assets (album_id, byte_size)
  where storage_path like 'r2:%';

create or replace function public.get_active_r2_storage_bytes()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(greatest(coalesce(assets.byte_size, 0), 0)), 0)::bigint
  from public.photobooth_album_assets as assets
  join public.photobooth_albums as albums
    on albums.id = assets.album_id
  where assets.storage_path like 'r2:%'
    and (albums.expires_at is null or albums.expires_at > now());
$$;

revoke all on function public.get_active_r2_storage_bytes() from public, anon, authenticated;
grant execute on function public.get_active_r2_storage_bytes() to service_role;
