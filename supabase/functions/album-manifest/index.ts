import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import {
  createR2PresignedGetUrl,
  isR2Configured,
  isR2StoragePath,
  isSafeAlbumR2Path,
  stripR2Prefix,
} from '../_shared/r2.ts'
import {
  buildStoragePublicUrl,
  createStorageSignedUrl,
  postgrestSelect,
  type SupabaseRestConfig,
} from '../_shared/supabase-rest.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Expose-Headers': 'Server-Timing',
  'X-Content-Type-Options': 'nosniff',
}

const codePattern = /^[a-z0-9_-]{6,64}$/i
const signedUrlTtlSeconds = 60 * 60
const manifestCacheMaxAgeSeconds = 300
const decorCatalogCacheTtlMs = 5 * 60 * 1000

interface AlbumAssetRow {
  id: string
  kind: string
  storage_path: string
  thumbnail_path: string | null
  mime_type: string
  file_name: string
  sort_order: number
  width: number | null
  height: number | null
  duration_ms: number | null
}

interface AlbumWithAssetsRow {
  id: string
  share_code: string
  title: string
  message: string | null
  created_at: string
  expires_at: string | null
  photobooth_album_assets?: AlbumAssetRow[]
}

interface StickerRow {
  id: string
  name: string
  category: string
  asset_path: string
}

interface BackgroundRow {
  id: string
  name: string
  asset_path: string
}

interface FrameRow {
  id: string
  name: string
  description: string | null
  config: Record<string, unknown> | null
  asset_path: string | null
  layout_id: string | null
  asset_width: number | null
  asset_height: number | null
}

interface FrameCatalogItem {
  id: string
  name: string
  description: string
  config: Record<string, unknown>
  assetUrl: string | null
  layoutId: string | null
  assetWidth: number | null
  assetHeight: number | null
}

interface DecorCatalog {
  stickers: Array<{ id: string; name: string; category: string; url: string }>
  backgrounds: Array<{ id: string; name: string; url: string }>
}

let cachedDecorCatalog: { expiresAt: number; value: DecorCatalog } | null = null
let inFlightDecorCatalog: Promise<DecorCatalog> | null = null
let cachedFramesCatalog: { expiresAt: number; value: FrameCatalogItem[] } | null = null
let inFlightFramesCatalog: Promise<FrameCatalogItem[]> | null = null

async function getFramesCatalog(config: SupabaseRestConfig): Promise<FrameCatalogItem[]> {
  const now = Date.now()
  if (cachedFramesCatalog && cachedFramesCatalog.expiresAt > now) {
    return cachedFramesCatalog.value
  }
  if (inFlightFramesCatalog) {
    return inFlightFramesCatalog
  }

  inFlightFramesCatalog = (async () => {
    const result = await postgrestSelect<FrameRow[]>(
      config,
      'photobooth_frames',
      'select=id,name,description,config,asset_path,layout_id,asset_width,asset_height&is_published=eq.true&order=sort_order.asc,name.asc',
    )
    if (result.error) {
      console.error('Frame catalog lookup failed')
      return []
    }
    const frames: FrameCatalogItem[] = (result.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      config: row.config && typeof row.config === 'object' ? row.config : {},
      assetUrl: row.asset_path
        ? buildStoragePublicUrl(config, 'photobooth-frames', row.asset_path)
        : null,
      layoutId: row.layout_id ?? null,
      assetWidth: row.asset_width ?? null,
      assetHeight: row.asset_height ?? null,
    }))
    cachedFramesCatalog = {
      expiresAt: Date.now() + decorCatalogCacheTtlMs,
      value: frames,
    }
    return frames
  })()

  try {
    return await inFlightFramesCatalog
  } finally {
    inFlightFramesCatalog = null
  }
}

async function getDecorCatalog(config: SupabaseRestConfig): Promise<DecorCatalog> {
  const now = Date.now()
  if (cachedDecorCatalog && cachedDecorCatalog.expiresAt > now) {
    return cachedDecorCatalog.value
  }
  if (inFlightDecorCatalog) {
    return inFlightDecorCatalog
  }

  inFlightDecorCatalog = (async () => {
    const [stickerResult, backgroundResult] = await Promise.all([
      postgrestSelect<StickerRow[]>(
        config,
        'photobooth_stickers',
        'select=id,name,category,asset_path&is_published=eq.true&order=sort_order.asc',
      ),
      postgrestSelect<BackgroundRow[]>(
        config,
        'photobooth_backgrounds',
        'select=id,name,asset_path&is_published=eq.true&order=sort_order.asc,name.asc',
      ),
    ])

    if (stickerResult.error) console.error('Sticker catalog lookup failed')
    if (backgroundResult.error) console.error('Background catalog lookup failed')

    const catalog: DecorCatalog = {
      stickers: (stickerResult.data ?? [])
        .filter((sticker) => sticker.category !== 'text' && sticker.category !== 'shapes')
        .map((sticker) => ({
          id: sticker.id,
          name: sticker.name,
          category: sticker.category,
          url: buildStoragePublicUrl(config, 'photobooth-stickers', sticker.asset_path),
        })),
      backgrounds: (backgroundResult.data ?? []).map((background) => ({
        id: background.id,
        name: background.name,
        url: buildStoragePublicUrl(config, 'photobooth-background', background.asset_path),
      })),
    }

    if (!stickerResult.error && !backgroundResult.error) {
      cachedDecorCatalog = {
        expiresAt: Date.now() + decorCatalogCacheTtlMs,
        value: catalog,
      }
    }
    return catalog
  })()

  try {
    return await inFlightDecorCatalog
  } finally {
    inFlightDecorCatalog = null
  }
}

function json(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(extraHeaders ?? {}),
    },
  })
}

Deno.serve(async (request: Request) => {
  const startedAt = performance.now()

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'GET') {
    return json({ error: 'Phương thức không được hỗ trợ.' }, 405)
  }

  const requestUrl = new URL(request.url)
  const isCatalogRequest = requestUrl.searchParams.get('catalog') === '1'
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing Supabase server credentials')
    return json({ error: 'Máy chủ album chưa được cấu hình.' }, 500)
  }

  const dbConfig: SupabaseRestConfig = { url: supabaseUrl, serviceRoleKey }

  if (isCatalogRequest) {
    const dbStart = performance.now()
    const [frames, decor] = await Promise.all([
      getFramesCatalog(dbConfig),
      getDecorCatalog(dbConfig),
    ])
    const dbDuration = performance.now() - dbStart
    const totalDuration = performance.now() - startedAt
    return json(
      { frames, decor },
      200,
      {
        'Cache-Control': `public, max-age=${manifestCacheMaxAgeSeconds}`,
        'Server-Timing': `db;dur=${dbDuration.toFixed(1)}, total;dur=${totalDuration.toFixed(1)}`,
      },
    )
  }

  const code = requestUrl.searchParams.get('code')?.trim().toLowerCase()
  if (!code || !codePattern.test(code)) {
    return json({ error: 'Mã album không hợp lệ.' }, 400)
  }

  const dbStart = performance.now()
  const albumQuery = [
    'select=id,share_code,title,message,created_at,expires_at,photobooth_album_assets(id,kind,storage_path,thumbnail_path,mime_type,file_name,sort_order,width,height,duration_ms)',
    `share_code=eq.${encodeURIComponent(code)}`,
    'status=eq.published',
    'photobooth_album_assets.kind=neq.video',
    'photobooth_album_assets.order=sort_order.asc',
    'limit=1',
  ].join('&')

  // Run album+assets lookup and decor catalog lookup in parallel (decor is cached in isolate memory for 5 min).
  const [albumResult, decor] = await Promise.all([
    postgrestSelect<AlbumWithAssetsRow[]>(dbConfig, 'photobooth_albums', albumQuery),
    getDecorCatalog(dbConfig),
  ])
  const dbDuration = performance.now() - dbStart

  if (albumResult.error) {
    console.error('Album lookup failed')
    return json({ error: 'Không thể tải album lúc này.' }, 500)
  }

  const album = albumResult.data?.[0]
  if (!album || (album.expires_at && Date.parse(album.expires_at) <= Date.now())) {
    return json({ error: 'Album không tồn tại hoặc đã hết hạn.' }, 404)
  }

  const assets = (album.photobooth_album_assets ?? [])
    .filter((asset) => asset.kind !== 'video')
    .sort((a, b) => a.sort_order - b.sort_order)

  const signStart = performance.now()
  const paths = Array.from(new Set(
    assets.flatMap((asset) =>
      [asset.storage_path, asset.thumbnail_path].filter((path): path is string => Boolean(path)),
    ),
  ))

  const signedUrlByPath = new Map<string, string>()
  if (paths.length > 0) {
    const r2Ready = isR2Configured()
    const signedFiles = await Promise.all(paths.map(async (path) => {
      if (isR2StoragePath(path)) {
        if (!r2Ready || !isSafeAlbumR2Path(path, album.id)) {
          return { path, signedUrl: undefined, failed: true }
        }
        try {
          const signedUrl = await createR2PresignedGetUrl({
            key: stripR2Prefix(path),
            expiresInSeconds: signedUrlTtlSeconds,
            responseCacheControl: 'private, max-age=3600, immutable',
          })
          return { path, signedUrl, failed: false }
        } catch {
          return { path, signedUrl: undefined, failed: true }
        }
      }

      const signed = await createStorageSignedUrl(dbConfig, 'photobooth-albums', path, signedUrlTtlSeconds)
      return { path, signedUrl: signed.data ?? undefined, failed: Boolean(signed.error || !signed.data) }
    }))

    const signedFailure = signedFiles.find((file) => file.failed || !file.signedUrl)
    if (signedFailure) {
      console.error('Signed URL creation failed')
      return json({ error: 'Không thể mở tệp trong album.' }, 500)
    }
    for (const file of signedFiles) {
      if (file.signedUrl) signedUrlByPath.set(file.path, file.signedUrl)
    }
  }
  const signDuration = performance.now() - signStart
  const totalDuration = performance.now() - startedAt

  return json(
    {
      album: {
        shareCode: album.share_code,
        title: album.title,
        message: album.message,
        createdAt: album.created_at,
        expiresAt: album.expires_at,
      },
      items: assets.map((asset) => ({
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
      decor,
    },
    200,
    {
      'Cache-Control': `private, max-age=${manifestCacheMaxAgeSeconds}`,
      'Server-Timing': `db;dur=${dbDuration.toFixed(1)}, sign;dur=${signDuration.toFixed(1)}, total;dur=${totalDuration.toFixed(1)}`,
    },
  )
})
