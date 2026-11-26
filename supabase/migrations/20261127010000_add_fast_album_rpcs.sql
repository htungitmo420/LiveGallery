create or replace function public.begin_album_upload(
  p_client_hash text,
  p_upload_limit integer,
  p_title text,
  p_message text,
  p_expires_at timestamptz,
  p_incoming_bytes bigint,
  p_max_r2_bytes bigint default null
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
  v_used_bytes bigint;
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

  if p_max_r2_bytes is not null then
    if p_max_r2_bytes <= 0 then
      return query select 'quota_exceeded'::text, null::uuid, null::text;
      return;
    end if;

    v_used_bytes := public.get_active_r2_storage_bytes();
    if v_used_bytes + greatest(coalesce(p_incoming_bytes, 0), 0) > p_max_r2_bytes then
      return query select 'quota_exceeded'::text, null::uuid, null::text;
      return;
    end if;
  end if;

  insert into public.photobooth_albums (title, message, status, expires_at)
  values (
    coalesce(nullif(btrim(p_title), ''), 'Khoảnh khắc của bạn'),
    nullif(btrim(coalesce(p_message, '')), ''),
    'draft',
    p_expires_at
  )
  returning id, public.photobooth_albums.share_code
    into v_album_id, v_share_code;

  insert into public.photobooth_album_upload_events (client_hash, album_id)
  values (p_client_hash, v_album_id);

  return query select 'ok'::text, v_album_id, v_share_code;
end;
$$;

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
  v_used_bytes bigint;
begin
  select albums.status
    into v_status
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

    v_used_bytes := public.get_active_r2_storage_bytes();
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
      updated_at = now()
  where id = p_album_id
    and status = 'draft';

  return 'ok';
exception
  when unique_violation then
    return 'conflict';
end;
$$;

revoke all on function public.begin_album_upload(text, integer, text, text, timestamptz, bigint, bigint) from public, anon, authenticated;
grant execute on function public.begin_album_upload(text, integer, text, text, timestamptz, bigint, bigint) to service_role;

revoke all on function public.finalize_album_publish(uuid, jsonb, bigint, bigint) from public, anon, authenticated;
grant execute on function public.finalize_album_publish(uuid, jsonb, bigint, bigint) to service_role;
