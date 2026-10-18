# Khoảnh Khắc LiveGallery

Website độc lập để khách quét QR, mở album photobooth và xem ảnh, GIF hoặc video trên điện thoại. Dự án dùng React + Vite, Supabase Storage riêng tư và có sẵn cấu hình Cloudflare.

## Chạy trên máy

1. Sao chép `.env.example` thành `.env.local`.
2. Điền `VITE_SUPABASE_URL` của dự án Supabase.
3. Chạy:

```bash
pnpm install
pnpm dev
```

Trang chủ cho phép nhập mã album. Link QR có dạng:

```text
https://gallery.example.com/i/<share_code>
```

## Dữ liệu Supabase

Migration trong `supabase/migrations` tạo:

- `photobooth_albums`: thông tin album và mã chia sẻ.
- `photobooth_album_assets`: ảnh, GIF và video theo đúng thứ tự.
- Bucket riêng tư `photobooth-albums`, giới hạn 100 MB mỗi tệp.
- RLS và thu hồi quyền đọc trực tiếp từ client.

Edge Function `album-manifest` nhận mã chia sẻ, kiểm tra album đã xuất bản và chưa hết hạn, sau đó tạo URL tạm thời trong một giờ. Edge Function `album-publish` nhận bộ ảnh từ `photobooth-itmo.vercel.app`, kiểm tra loại tệp, dung lượng và giới hạn số album theo thiết bị trước khi ghi vào Storage. Frontend không chứa service-role key.

## Kiểm tra

```bash
pnpm test
pnpm run typecheck
pnpm run build
```

## Triển khai Cloudflare

### Cloudflare Workers

```bash
pnpm run build
pnpm run deploy
```

`wrangler.jsonc` đã bật SPA fallback nên link `/i/<share_code>` vẫn hoạt động khi mở trực tiếp.

### Cloudflare Pages qua Git

- Build command: `pnpm run build`
- Output directory: `dist`
- Environment variable: `VITE_SUPABASE_URL`

Cloudflare Pages tự nhận đây là ứng dụng SPA khi dự án không có trang `404.html`.

## Kết nối Photobooth

Photobooth gửi một request multipart tới `album-publish`, gồm bản photobooth hoàn chỉnh, GIF, video (khi trình duyệt hỗ trợ) và toàn bộ ảnh gốc. Function tạo album ở trạng thái nháp, tải các tệp vào bucket riêng tư, ghi metadata rồi mới xuất bản album. Phản hồi chứa mã riêng và đường dẫn dạng:

```text
https://livegallery.nhtisitmo.workers.dev/i/<share_code>
```

QR được tạo ngay trong trình duyệt từ đường dẫn này. Secret key chỉ tồn tại trong Edge Function.
