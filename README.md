# Khoảnh Khắc LiveGallery

Website để khách quét mã QR, mở album photobooth, trang trí sticker hoặc nền ghép và tải ảnh hoặc GIF gốc trực tiếp về điện thoại. Dự án dùng React và Vite (triển khai trên Vercel), Supabase (PostgreSQL và Edge Functions) cùng Cloudflare R2 (gói miễn phí 10 GB lưu trữ, miễn phí băng thông tải ra) để tải album song song mà vẫn giữ nguyên chất lượng ảnh gốc.

## Chạy trên máy

1. Sao chép `.env.example` thành `.env.local`.
2. Điền `VITE_SUPABASE_URL` của dự án Supabase. Không đặt khóa bí mật hay thông tin R2 trong `.env.local`.
3. Chạy:

```bash
pnpm install
pnpm dev
```

Trang chủ cho phép nhập mã album. Đường dẫn QR có dạng:

```text
https://photobooth-itmo.vercel.app/i/<share_code>
```

## Kiểm tra

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Kiến trúc lưu trữ và tải lên song song

Supabase PostgreSQL lưu metadata và kiểm soát truy cập bằng RLS:

- `photobooth_albums`: thông tin album, trạng thái `draft` hoặc `published`, mã chia sẻ và hạn lưu 30 ngày (`expires_at`).
- `photobooth_album_assets`: danh sách ảnh và GIF theo đúng thứ tự. Đường dẫn bắt đầu bằng `r2:` trỏ tới album mới trên Cloudflare R2; các đường dẫn không có tiền tố trỏ tới album cũ trên Supabase Storage.
- `photobooth_album_upload_events`: lưu chuỗi băm HMAC-SHA256 của địa chỉ IP (không lưu IP gốc) để giới hạn 300 album mỗi giờ cho mạng Wi-Fi sự kiện đông khách.
- Cả ba bảng đều bật RLS và thu hồi toàn bộ quyền truy cập trực tiếp từ `anon` và `authenticated`.

Luồng tải trực tiếp song song lên R2 qua Edge Function `album-publish`:

1. Trình duyệt gửi `POST` JSON với `action: "init"`. Máy chủ kiểm tra nguồn gọi (`ALLOWED_PHOTOBOOTH_ORIGINS`), định dạng tệp, dung lượng (tối đa 12 MB mỗi tệp và 60 MB mỗi album), kiểm tra hạn mức tải, tạo album nháp, ký `uploadToken` bằng HMAC-SHA256 (hết hạn sau 10 phút, gắn với `albumId`, `shareCode` và danh sách tệp) rồi trả về các URL Presigned `PUT` (hạn 300 giây) theo chuẩn AWS SigV4 bằng Web Crypto.
2. Trình duyệt Photobooth tải song song tối đa 5 tệp cùng lúc trực tiếp lên Cloudflare R2.
3. Khi tải xong, trình duyệt gửi `POST` JSON với `action: "complete"`. Máy chủ xác thực `uploadToken` theo kiểu constant-time, chạy `HEAD` song song để kiểm tra dung lượng và `Content-Type` thực tế trên R2, ghi `photobooth_album_assets` và chuyển album sang `published`.
4. Nếu xảy ra lỗi giữa chừng, trình duyệt gọi `action: "abort"` để xóa album nháp và dọn các tệp R2 tải dở.
5. Nếu máy chủ chưa cấu hình R2, `init` trả về `{ mode: "multipart" }` và nhánh `multipart/form-data` vẫn chạy song song 5 luồng như cũ.

Khi mở album, Edge Function `album-manifest` tự động tạo URL `GET` có chữ ký (hạn 1 giờ) qua Cloudflare R2 cho đường dẫn `r2:` và qua Supabase Storage cho album cũ. Giao diện đặt `crossOrigin="anonymous"` trên ảnh album để trình duyệt chia sẻ cùng bộ đệm CORS giữa trình xem, nút tải ảnh và canvas trong `DecorStudio`.

## Cấu hình Cloudflare R2 (gói miễn phí)

1. Tạo một bucket riêng tư trong Cloudflare R2, ví dụ `khoanhkhac-albums`. Không bật Public Access hay `r2.dev` vì mọi lượt tải lên và xem ảnh đều đi qua Presigned URL có thời hạn.
2. Tạo R2 API Token với quyền tối thiểu:
   - Permissions: Object Read & Write
   - Specify bucket(s): chọn đúng bucket `khoanhkhac-albums`
   - Lưu lại `Account ID`, `Access Key ID`, `Secret Access Key`.
3. Cấu hình CORS Policy cho bucket (cần `PUT` cho Photobooth, `GET` và `HEAD` cho LiveGallery tải ảnh và vẽ canvas trong `DecorStudio`):

```json
[
  {
    "AllowedOrigins": [
      "https://photobooth-itmo.vercel.app",
      "http://localhost:5173",
      "http://localhost:4173"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

4. Tạo Object Lifecycle Rule 30 ngày trong mục Settings > Object lifecycle rules của bucket:
   - Rule name: `expire-albums-after-30-days`
   - Prefix: để trống để áp dụng cho toàn bucket
   - Action: Delete uploaded objects after 30 days
   - Quy tắc này khớp với `expires_at` sau 30 ngày trong cơ sở dữ liệu và giữ dung lượng trong hạn mức 10 GB miễn phí.
5. Chặn cứng tự động ở mức 9.5 GB: `album-publish` tự cộng tổng dung lượng các tệp `r2:` còn hạn qua hàm RPC `get_active_r2_storage_bytes()`. Nếu vượt `9_500_000_000` byte (có thể tùy chỉnh bằng secret `R2_MAX_STORAGE_BYTES`, hoặc đặt `0` để ngắt upload khẩn cấp), hệ thống sẽ từ chối tải lên mới (`HTTP 507`) trong khi khách cũ vẫn xem và tải album bình thường.

## Cấu hình Secrets và triển khai Supabase Edge Functions

Thiết lập secrets trên máy chủ Supabase (không đưa vào frontend hay git):

```bash
supabase secrets set \
  LIVE_GALLERY_URL="https://photobooth-itmo.vercel.app" \
  ALLOWED_PHOTOBOOTH_ORIGINS="https://photobooth-itmo.vercel.app" \
  R2_ACCOUNT_ID="<cloudflare-account-id>" \
  R2_ACCESS_KEY_ID="<r2-access-key-id>" \
  R2_SECRET_ACCESS_KEY="<r2-secret-access-key>" \
  R2_BUCKET_NAME="khoanhkhac-albums"
```

Tệp `supabase/config.toml` đã khai báo `verify_jwt = false` cho cả `album-publish` và `album-manifest`. Triển khai hai Edge Functions bằng lệnh:

```bash
supabase functions deploy album-publish --no-verify-jwt
supabase functions deploy album-manifest --no-verify-jwt
```

## Triển khai LiveGallery lên Vercel

Dự án triển khai trên Vercel với cấu hình sẵn trong `vercel.json`:

- Điều hướng SPA: chuyển mọi đường dẫn như `/i/<share_code>` về `/index.html` mà không chặn `/assets/*`, `/_vercel/*`, `/favicon.svg` hay `/robots.txt`.
- Header bảo mật: đặt `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` và `Content-Security-Policy` (cho phép Google Fonts, Supabase, Cloudflare R2 `*.r2.cloudflarestorage.com`, `blob:`, `data:`, cùng mã băm SHA-256 của đoạn script khởi tạo giao diện sáng/tối trong `index.html`).
- Bộ đệm tài nguyên tĩnh: đặt `Cache-Control: public, max-age=31536000, immutable` cho `/assets/*`.

Các bước triển khai trên Vercel:

1. Import repository LiveGallery vào Vercel và chọn Framework Preset là Vite.
2. Đặt Build Command là `pnpm run build` và Output Directory là `dist`.
3. Thêm biến môi trường trong Vercel Project Settings:
   - `VITE_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `VITE_GALLERY_API_URL` (tùy chọn) nếu đặt `album-manifest` sau một domain riêng.
4. Đảm bảo đã cập nhật secret `LIVE_GALLERY_URL="https://photobooth-itmo.vercel.app"` trên Supabase Edge Functions và thêm `https://photobooth-itmo.vercel.app` vào `AllowedOrigins` trong CORS Policy của bucket Cloudflare R2.
