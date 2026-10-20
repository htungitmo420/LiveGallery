insert into public.photobooth_frames
  (id, name, description, config, asset_path, layout_id, asset_width, asset_height, is_published, sort_order)
values
  (
    'white-grid4', 'Trắng · 2×2', 'Khung trắng cho bố cục lưới 2×2',
    '{"background":"#ffffff","accent":"#111111","textColor":"#111111","radius":0}'::jsonb,
    'white_2x2.png', 'grid4', 1254, 1254, true, 20
  ),
  (
    'white-strip3', 'Trắng · 3 ảnh', 'Khung trắng cho dải 3 ảnh',
    '{"background":"#ffffff","accent":"#111111","textColor":"#111111","radius":0}'::jsonb,
    'white_3x1.png', 'strip3', 941, 1672, true, 20
  ),
  (
    'white-strip4', 'Trắng · 4 ảnh', 'Khung trắng cho dải 4 ảnh',
    '{"background":"#ffffff","accent":"#111111","textColor":"#111111","radius":0}'::jsonb,
    'white_4x1.png', 'strip4', 941, 1672, true, 20
  ),
  (
    'film-grid4', 'Film · 2×2', 'Khung film cho bố cục lưới 2×2',
    '{"background":"#ffffff","accent":"#111111","textColor":"#111111","radius":0}'::jsonb,
    'film_2x2.png', 'grid4', 1254, 1254, true, 30
  ),
  (
    'film-strip3', 'Film · 3 ảnh', 'Khung film cho dải 3 ảnh',
    '{"background":"#ffffff","accent":"#111111","textColor":"#111111","radius":0}'::jsonb,
    'film_3x1.png', 'strip3', 793, 1983, true, 30
  ),
  (
    'film-strip4', 'Film · 4 ảnh', 'Khung film cho dải 4 ảnh',
    '{"background":"#ffffff","accent":"#111111","textColor":"#111111","radius":0}'::jsonb,
    'film_4x1.png', 'strip4', 793, 1983, true, 30
  ),
  (
    'polaroid-social', 'Polaroid mạng xã hội', 'Khung một ảnh phong cách mạng xã hội',
    '{"background":"#ffffff","accent":"#111111","textColor":"#111111","radius":0}'::jsonb,
    'polaroid.png', 'polaroid', 1429, 1100, true, 20
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  config = excluded.config,
  asset_path = excluded.asset_path,
  layout_id = excluded.layout_id,
  asset_width = excluded.asset_width,
  asset_height = excluded.asset_height,
  is_published = excluded.is_published,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc', now());

