alter table public.photobooth_frames
  add column if not exists layout_id text,
  add column if not exists asset_width integer,
  add column if not exists asset_height integer;

alter table public.photobooth_frames
  add constraint photobooth_frames_layout_id_check
    check (layout_id is null or layout_id in ('strip3', 'strip4', 'grid4', 'polaroid')),
  add constraint photobooth_frames_asset_dimensions_check
    check ((asset_width is null or asset_width > 0) and (asset_height is null or asset_height > 0)),
  add constraint photobooth_frames_asset_metadata_check
    check (asset_path is null or (layout_id is not null and asset_width is not null and asset_height is not null));

create index if not exists photobooth_frames_published_layout_idx
  on public.photobooth_frames (layout_id, sort_order)
  where is_published = true;

