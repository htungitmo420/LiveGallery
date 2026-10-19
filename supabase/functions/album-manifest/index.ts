import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const codePattern = /^[a-z0-9_-]{6,64}$/i
const signedUrlTtlSeconds = 60 * 60

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'GET') {
    return json({ error: 'Phương thức không được hỗ trợ.' }, 405)
  }

  const code = new URL(request.url).searchParams.get('code')?.trim().toLowerCase()
  if (!code || !codePattern.test(code)) {
    return json({ error: 'Mã album không hợp lệ.' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing Supabase server credentials')
    return json({ error: 'Máy chủ album chưa được cấu hình.' }, 500)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: album, error: albumError } = await admin
    .from('photobooth_albums')
    .select('id, share_code, title, message, created_at, expires_at')
    .eq('share_code', code)
    .eq('status', 'published')
    .maybeSingle()

  if (albumError) {
    console.error('Album lookup failed', albumError)
    return json({ error: 'Không thể tải album lúc này.' }, 500)
  }

  if (!album || (album.expires_at && Date.parse(album.expires_at) <= Date.now())) {
    return json({ error: 'Album không tồn tại hoặc đã hết hạn.' }, 404)
  }

  const { data: assets, error: assetsError } = await admin
    .from('photobooth_album_assets')
    .select('id, kind, storage_path, thumbnail_path, mime_type, file_name, sort_order, width, height, duration_ms')
    .eq('album_id', album.id)
    .neq('kind', 'video')
    .order('sort_order', { ascending: true })

  if (assetsError) {
    console.error('Asset lookup failed', assetsError)
    return json({ error: 'Không thể tải ảnh trong album.' }, 500)
  }

  const [{ data: stickerRows, error: stickerError }, { data: backgroundRows, error: backgroundError }] = await Promise.all([
    admin
      .from('photobooth_stickers')
      .select('id, name, category, asset_path')
      .eq('is_published', true)
      .order('sort_order'),
    admin
      .from('photobooth_backgrounds')
      .select('id, name, asset_path')
      .eq('is_published', true)
      .order('sort_order')
      .order('name'),
  ])
  if (stickerError) console.error('Sticker catalog lookup failed', stickerError)
  if (backgroundError) console.error('Background catalog lookup failed', backgroundError)

  const paths = Array.from(new Set(
    (assets ?? []).flatMap((asset) =>
      [asset.storage_path, asset.thumbnail_path].filter((path): path is string => Boolean(path)),
    ),
  ))

  const signedUrlByPath = new Map<string, string>()
  if (paths.length > 0) {
    const signedFiles = await Promise.all(paths.map(async (path) => {
      const { data, error } = await admin.storage
        .from('photobooth-albums')
        .createSignedUrl(path, signedUrlTtlSeconds)
      return { path, signedUrl: data?.signedUrl, error }
    }))
    const signedError = signedFiles.find((file) => file.error || !file.signedUrl)
    if (signedError) {
      console.error('Signed URL creation failed', signedError.error)
      return json({ error: 'Không thể mở tệp trong album.' }, 500)
    }
    for (const file of signedFiles) {
      if (file.signedUrl) signedUrlByPath.set(file.path, file.signedUrl)
    }
  }

  return json({
    album: {
      shareCode: album.share_code,
      title: album.title,
      message: album.message,
      createdAt: album.created_at,
      expiresAt: album.expires_at,
    },
    items: (assets ?? []).map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      url: signedUrlByPath.get(asset.storage_path),
      thumbnailUrl: asset.thumbnail_path ? signedUrlByPath.get(asset.thumbnail_path) ?? null : null,
      mimeType: asset.mime_type,
      fileName: asset.file_name,
      sortOrder: asset.sort_order,
      width: asset.width,
      height: asset.height,
      durationMs: asset.duration_ms,
    })),
    decor: {
      stickers: (stickerRows ?? [])
        .filter((sticker) => sticker.category !== 'text' && sticker.category !== 'shapes')
        .map((sticker) => ({
          id: sticker.id,
          name: sticker.name,
          category: sticker.category,
          url: admin.storage.from('photobooth-stickers').getPublicUrl(sticker.asset_path).data.publicUrl,
        })),
      backgrounds: (backgroundRows ?? []).map((background) => ({
        id: background.id,
        name: background.name,
        url: admin.storage.from('photobooth-background').getPublicUrl(background.asset_path).data.publicUrl,
      })),
    },
  })
})
