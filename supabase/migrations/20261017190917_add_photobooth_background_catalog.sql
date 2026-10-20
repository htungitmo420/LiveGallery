drop policy if exists "Public can view photobooth backgrounds" on storage.objects;

create table if not exists public.photobooth_backgrounds (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 80),
  asset_path text not null unique,
  is_published boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint photobooth_backgrounds_asset_path_safe check (
    asset_path <> '' and asset_path !~ '(^|/)\.\.(/|$)'
  )
);

alter table public.photobooth_backgrounds enable row level security;

grant select on table public.photobooth_backgrounds to anon, authenticated;
grant update (name, is_published, sort_order) on table public.photobooth_backgrounds to authenticated;

drop policy if exists "Published photobooth backgrounds are public" on public.photobooth_backgrounds;
drop policy if exists "Admins can update photobooth backgrounds catalog" on public.photobooth_backgrounds;

create policy "Published photobooth backgrounds are public"
on public.photobooth_backgrounds for select
to anon, authenticated
using (is_published = true);

create policy "Admins can update photobooth backgrounds catalog"
on public.photobooth_backgrounds for update
to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create schema if not exists photobooth_private;
revoke all on schema photobooth_private from public, anon, authenticated;

create or replace function photobooth_private.sync_background_asset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  display_name text;
begin
  if tg_op = 'DELETE' then
    if old.bucket_id = 'photobooth-background' then
      delete from public.photobooth_backgrounds where id = old.id;
    end if;
    return old;
  end if;

  if new.bucket_id = 'photobooth-background'
     and storage.extension(new.name) in ('png', 'jpg', 'jpeg', 'webp') then
    display_name := left(
      regexp_replace(
        regexp_replace(regexp_replace(new.name, '^.*/', ''), '\.[^.]+$', ''),
        '[-_]+', ' ', 'g'
      ),
      80
    );

    insert into public.photobooth_backgrounds (id, name, asset_path, created_at, updated_at)
    values (
      new.id,
      coalesce(nullif(btrim(display_name), ''), 'Nền Supabase'),
      new.name,
      coalesce(new.created_at, timezone('utc', now())),
      timezone('utc', now())
    )
    on conflict (id) do update set
      name = excluded.name,
      asset_path = excluded.asset_path,
      updated_at = excluded.updated_at;
  elsif tg_op = 'UPDATE' and old.bucket_id = 'photobooth-background' then
    delete from public.photobooth_backgrounds where id = old.id;
  end if;

  return new;
end;
$$;

revoke all on function photobooth_private.sync_background_asset() from public, anon, authenticated;

drop trigger if exists sync_photobooth_background_asset on storage.objects;
create trigger sync_photobooth_background_asset
after insert or update of name, bucket_id or delete on storage.objects
for each row execute function photobooth_private.sync_background_asset();

insert into public.photobooth_backgrounds (id, name, asset_path, created_at, updated_at)
select
  object.id,
  coalesce(
    nullif(
      btrim(left(
        regexp_replace(
          regexp_replace(regexp_replace(object.name, '^.*/', ''), '\.[^.]+$', ''),
          '[-_]+', ' ', 'g'
        ),
        80
      )),
      ''
    ),
    'Nền Supabase'
  ),
  object.name,
  object.created_at,
  timezone('utc', now())
from storage.objects as object
where object.bucket_id = 'photobooth-background'
  and storage.extension(object.name) in ('png', 'jpg', 'jpeg', 'webp')
on conflict (id) do update set
  name = excluded.name,
  asset_path = excluded.asset_path,
  updated_at = excluded.updated_at;

