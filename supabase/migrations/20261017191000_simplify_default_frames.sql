update public.photobooth_frames
set
  name = 'Trắng viền đen',
  description = 'Nền trắng, viền ảnh đen bo tròn',
  config = '{"background":"#ffffff","accent":"#111111","textColor":"#111111","radius":26}'::jsonb,
  is_published = true,
  sort_order = 10,
  updated_at = timezone('utc', now())
where id = 'paper';

update public.photobooth_frames
set
  is_published = false,
  updated_at = timezone('utc', now())
where id in ('midnight', 'cream', 'blush', 'lavender', 'film');

