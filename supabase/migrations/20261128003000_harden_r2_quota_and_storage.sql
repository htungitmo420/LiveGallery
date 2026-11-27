-- Security hardening migration:
-- 1. Track reserved_bytes on draft albums so abandoned presigned R2 uploads count toward the 9.5 GB cap
--    until the 30-day R2 object lifecycle rule deletes them (eliminating orphaned-draft quota bypass).
-- 2. Add a global hourly upload circuit breaker across all clients in begin_album_upload.
-- 3. Remove image/svg+xml (.svg) from public photobooth-frames and photobooth-stickers storage buckets.

alter table public.photobooth_albums
  add column if not exists reserved_bytes bigint not null default 0;

alter table public.photobooth_albums
  drop constraint if exists photobooth_albums_reserved_bytes_check;

alter table public.photobooth_albums
  add constraint photobooth_albums_reserved_bytes_check
    check (reserved_bytes >= 0);

create index if not exists photobooth_albums_draft_reserved_bytes_idx
  on public.photobooth_albums (expires_at, reserved_bytes)
  where status = 'draft' and reserved_bytes > 0;

create index if not exists photobooth_album_upload_events_created_at_idx
  on public.photobooth_album_upload_events (created_at desc);

create or replace function public.get_active_r2_storage_bytes()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select (
    coalesce((
      select sum(greatest(coalesce(assets.byte_size, 0), 0))
      from public.photobooth_album_assets as assets
      join public.photobooth_albums as albums
        on albums.id = assets.album_id
      where assets.storage_path like 'r2:%'
        and (albums.expires_at is null or albums.expires_at > now())
    ), 0)
    +
    coalesce((
      select sum(greatest(coalesce(drafts.reserved_bytes, 0), 0))
      from public.photobooth_albums as drafts
      where drafts.status = 'draft'
        and drafts.reserved_bytes > 0
        and (drafts.expires_at is null or drafts.expires_at > now())
    ), 0)
  )::bigint;
$$;

revoke all on function public.get_active_r2_storage_bytes() from public, anon, authenticated;
grant execute on function public.get_active_r2_storage_bytes() to service_role;

drop function if exists public.begin_album_upload(text, integer, text, text, timestamptz, bigint, bigint);

create or replace function public.begin_album_upload(
  p_client_hash text,
  p_upload_limit integer,
  p_title text,
  p_message text,
  p_expires_at timestamptz,
  p_incoming_bytes bigint,
  p_max_r2_bytes bigint default null,
  p_global_upload_limit integer default 1200
)
returns table (
  status text,
  album_id uuid,
  share_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent_count bigint;
  v_global_count bigint;
  v_used_bytes bigint;
  v_reserved_bytes bigint;
  v_album_id uuid;
  v_share_code text;
begin
  select count(*)
    into v_recent_count
  from public.photobooth_album_upload_events as events
  where events.client_hash = p_client_hash
    and events.created_at >= now() - interval '1 hour';

  if v_recent_count >= greatest(coalesce(p_upload_limit, 1), 1) then
    return query select 'rate_limited'::text, null::uuid, null::text;
    return;
  end if;

  if p_global_upload_limit is not null then
    select count(*)
      into v_global_count
    from public.photobooth_album_upload_events as events
    where events.created_at >= now() - interval '1 hour';

    if v_global_count >= greatest(p_global_upload_limit, 1) then
      return query select 'rate_limited'::text, null::uuid, null::text;
      return;
    end if;
  end if;

  v_reserved_bytes := 0;
  if p_max_r2_bytes is not null then
    if p_max_r2_bytes <= 0 then
      return query select 'quota_exceeded'::text, null::uuid, null::text;
      return;
    end if;

    v_reserved_bytes := greatest(coalesce(p_incoming_bytes, 0), 0);
    v_used_bytes := public.get_active_r2_storage_bytes();
    if v_used_bytes + v_reserved_bytes > p_max_r2_bytes then
      return query select 'quota_exceeded'::text, null::uuid, null::text;
      return;
    end if;
  end if;

  insert into public.photobooth_albums (title, message, status, expires_at, reserved_bytes)
  values (
    coalesce(nullif(btrim(p_title), ''), 'Khoảnh khắc của bạn'),
    nullif(btrim(coalesce(p_message, '')), ''),
    'draft',
    p_expires_at,
    v_reserved_bytes
  )
  returning id, public.photobooth_albums.share_code
    into v_album_id, v_share_code;

  insert into public.photobooth_album_upload_events (client_hash, album_id)
  values (p_client_hash, v_album_id);

  return query select 'ok'::text, v_album_id, v_share_code;
end;
$$;

revoke all on function public.begin_album_upload(text, integer, text, text, timestamptz, bigint, bigint, integer) from public, anon, authenticated;
grant execute on function public.begin_album_upload(text, integer, text, text, timestamptz, bigint, bigint, integer) to service_role;

create or replace function public.finalize_album_publish(
  p_album_id uuid,
  p_assets jsonb,
  p_incoming_bytes bigint default 0,
  p_max_r2_bytes bigint default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_own_reserved bigint;
  v_used_bytes bigint;
begin
  select albums.status, albums.reserved_bytes
    into v_status, v_own_reserved
  from public.photobooth_albums as albums
  where albums.id = p_album_id
  for update;

  if v_status is null or v_status <> 'draft' then
    return 'not_draft';
  end if;

  if p_max_r2_bytes is not null then
    if p_max_r2_bytes <= 0 then
      return 'quota_exceeded';
    end if;

    v_used_bytes := greatest(
      public.get_active_r2_storage_bytes() - greatest(coalesce(v_own_reserved, 0), 0),
      0
    );
    if v_used_bytes + greatest(coalesce(p_incoming_bytes, 0), 0) > p_max_r2_bytes then
      return 'quota_exceeded';
    end if;
  end if;

  insert into public.photobooth_album_assets (
    album_id,
    kind,
    storage_path,
    mime_type,
    file_name,
    sort_order,
    byte_size
  )
  select
    p_album_id,
    item->>'kind',
    item->>'storage_path',
    item->>'mime_type',
    item->>'file_name',
    (item->>'sort_order')::integer,
    (item->>'byte_size')::bigint
  from jsonb_array_elements(p_assets) as item;

  update public.photobooth_albums
  set status = 'published',
      reserved_bytes = 0,
      updated_at = now()
  where id = p_album_id
    and status = 'draft';

  return 'ok';
exception
  when unique_violation then
    return 'conflict';
end;
$$;

revoke all on function public.finalize_album_publish(uuid, jsonb, bigint, bigint) from public, anon, authenticated;
grant execute on function public.finalize_album_publish(uuid, jsonb, bigint, bigint) to service_role;

-- Disallow SVG uploads in public frame & sticker buckets (raster PNG/WebP only).
update storage.buckets
set allowed_mime_types = array['image/png', 'image/webp']
where id in ('photobooth-frames', 'photobooth-stickers');

drop policy if exists "Admins can upload frame assets" on storage.objects;
drop policy if exists "Admins can update frame assets" on storage.objects;

create policy "Admins can upload frame assets"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'photobooth-frames'
  and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
  and storage.extension(name) in ('png', 'webp')
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
  and storage.extension(name) in ('png', 'webp')
);

drop policy if exists "Admins can upload sticker assets" on storage.objects;
drop policy if exists "Admins can update sticker assets" on storage.objects;

create policy "Admins can upload sticker assets"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'photobooth-stickers'
  and ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
  and storage.extension(name) in ('png', 'webp')
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
  and storage.extension(name) in ('png', 'webp')
);
