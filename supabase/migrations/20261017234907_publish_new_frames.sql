insert into public.photobooth_frames
  (id, name, description, config, asset_path, layout_id, asset_width, asset_height, is_published, sort_order)
values
  (
    'memories-grid4', 'Memories · 2×2', 'Khung Memories cho bố cục lưới 2×2',
    '{"background":"#fffaf3","accent":"#855d49","textColor":"#3d2b23","radius":0}'::jsonb,
    'memories_2x2.png', 'grid4', 1362, 1550, true, 100
  ),
  (
    'memories-strip3', 'Memories · 3 ảnh', 'Khung Memories cho dải 3 ảnh',
    '{"background":"#fffaf3","accent":"#855d49","textColor":"#3d2b23","radius":0}'::jsonb,
    'memories_3x1.png', 'strip3', 754, 1862, true, 100
  ),
  (
    'memories-strip4', 'Memories · 4 ảnh', 'Khung Memories cho dải 4 ảnh',
    '{"background":"#fffaf3","accent":"#855d49","textColor":"#3d2b23","radius":0}'::jsonb,
    'memories_4x1.png', 'strip4', 724, 2032, true, 100
  ),
  (
    'star-grid4', 'Ngôi sao · 2×2', 'Khung ngôi sao cho bố cục lưới 2×2',
    '{"background":"#fffaf3","accent":"#d4a52c","textColor":"#3d2b23","radius":0}'::jsonb,
    'star_2x2.png', 'grid4', 1024, 1536, true, 110
  ),
  (
    'star-strip3', 'Ngôi sao · 3 ảnh', 'Khung ngôi sao cho dải 3 ảnh',
    '{"background":"#fffaf3","accent":"#d4a52c","textColor":"#3d2b23","radius":0}'::jsonb,
    'star_3x1.png', 'strip3', 1024, 1536, true, 110
  ),
  (
    'star-strip4', 'Ngôi sao · 4 ảnh', 'Khung ngôi sao cho dải 4 ảnh',
    '{"background":"#fffaf3","accent":"#d4a52c","textColor":"#3d2b23","radius":0}'::jsonb,
    'star_4x1.png', 'strip4', 1024, 1536, true, 110
  ),
  (
    'white-heart-grid4', 'Trái tim trắng · 2×2', 'Khung trái tim trắng cho bố cục lưới 2×2',
    '{"background":"#ffffff","accent":"#cf6679","textColor":"#542a34","radius":0}'::jsonb,
    'white_heart_2x2.png', 'grid4', 1254, 1254, true, 120
  ),
  (
    'white-heart-strip3', 'Trái tim trắng · 3 ảnh', 'Khung trái tim trắng cho dải 3 ảnh',
    '{"background":"#ffffff","accent":"#cf6679","textColor":"#542a34","radius":0}'::jsonb,
    'white_heart_3x1.png', 'strip3', 941, 1672, true, 120
  ),
  (
    'white-heart-strip4', 'Trái tim trắng · 4 ảnh', 'Khung trái tim trắng cho dải 4 ảnh',
    '{"background":"#ffffff","accent":"#cf6679","textColor":"#542a34","radius":0}'::jsonb,
    'white_heart_4x1.png', 'strip4', 941, 1672, true, 120
  ),
  (
    'kodak-portra-grid4', 'KODAK PORTRA · 2×2', 'Khung KODAK PORTRA cho bố cục lưới 2×2',
    '{"background":"#fff8e9","accent":"#dc8b2e","textColor":"#3c2818","radius":0}'::jsonb,
    'KODAK_PORTRA_2x2.png', 'grid4', 1350, 1730, true, 130
  ),
  (
    'kodak-portra-strip3', 'KODAK PORTRA · 3 ảnh', 'Khung KODAK PORTRA cho dải 3 ảnh',
    '{"background":"#fff8e9","accent":"#dc8b2e","textColor":"#3c2818","radius":0}'::jsonb,
    'KODAK_PORTRA_3x1.png', 'strip3', 730, 2536, true, 130
  ),
  (
    'kodak-portra-strip4', 'KODAK PORTRA · 4 ảnh', 'Khung KODAK PORTRA cho dải 4 ảnh',
    '{"background":"#fff8e9","accent":"#dc8b2e","textColor":"#3c2818","radius":0}'::jsonb,
    'KODAK_PORTRA_4x1.png', 'strip4', 730, 3342, true, 130
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

