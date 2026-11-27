import {
  DEFAULT_ALLOWED_PHOTOBOOTH_ORIGIN,
  deleteR2Object,
  extractClientIp,
  hmacSha256Hex,
  isAllowedOrigin,
  isLocalhostEnabled,
  parseAllowedOrigins,
  runWithConcurrency,
} from '../_shared/r2.ts'
import {
  postgrestDelete,
  postgrestRpc,
  postgrestSelect,
  type SupabaseRestConfig,
} from '../_shared/supabase-rest.ts'
import {
  DEFAULT_GLOBAL_UPLOAD_LIMIT_PER_HOUR,
  R2_PARALLEL_CONCURRENCY,
  R2_QUOTA_EXCEEDED_ERROR,
  R2_QUOTA_LOOKUP_ERROR,
  UPLOAD_LIMIT_PER_HOUR,
} from './validation.ts'

const DEFAULT_GALLERY_BASE_URL = DEFAULT_ALLOWED_PHOTOBOOTH_ORIGIN
const UNSIGNED_INT_PATTERN = /^\d+$/
export const textEncoder = new TextEncoder()

export interface BeginUploadRow {
  status: 'ok' | 'rate_limited' | 'quota_exceeded'
  album_id: string | null
  share_code: string | null
}

export interface DraftAlbumRow {
  id: string
  share_code: string
  status: string
}

export interface PublishContext {
  startedAt: number
  origin: string | null
  allowedOrigins: readonly string[]
  allowLocalhost: boolean
  galleryBaseUrl: string
  dbConfig: SupabaseRestConfig
  signingSecret: string
}

export function resolveGalleryBaseUrl(): string {
  const raw = Deno.env.get('LIVE_GALLERY_URL')?.trim()
  if (!raw) {
    console.warn('LIVE_GALLERY_URL is not set; falling back to default gallery URL.')
    return DEFAULT_GALLERY_BASE_URL
  }
  try {
    const parsed = new URL(raw)
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
    if (parsed.protocol === 'https:' || (isLocal && parsed.protocol === 'http:')) {
      return raw.replace(/\/+$/, '')
    }
  } catch {
    /* Fall back to default URL when env is malformed. */
  }
  return DEFAULT_GALLERY_BASE_URL
}

export function getAllowedOrigins(): string[] {
  return parseAllowedOrigins(Deno.env.get('ALLOWED_PHOTOBOOTH_ORIGINS'), DEFAULT_ALLOWED_PHOTOBOOTH_ORIGIN)
}

export function getAllowLocalhost(): boolean {
  return isLocalhostEnabled(Deno.env.get('ALLOW_LOCALHOST_ORIGINS'))
}

export function resolveGlobalUploadLimit(): number {
  const raw = Deno.env.get('GLOBAL_UPLOAD_LIMIT_PER_HOUR')?.trim() ?? ''
  if (!raw || !UNSIGNED_INT_PATTERN.test(raw)) return DEFAULT_GLOBAL_UPLOAD_LIMIT_PER_HOUR
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1) return DEFAULT_GLOBAL_UPLOAD_LIMIT_PER_HOUR
  return parsed
}

export function corsHeadersFor(
  origin: string | null,
  allowedOrigins: readonly string[],
  allowLocalhost = false,
) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin, allowedOrigins, { allowLocalhost })
      ? origin!
      : allowedOrigins[0],
    'Access-Control-Allow-Headers': 'apikey, content-type, x-client-info, x-photobooth-client',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers': 'Server-Timing',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
  }
}

export function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
  allowedOrigins: readonly string[],
  extraHeaders?: Record<string, string>,
  allowLocalhost = false,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersFor(origin, allowedOrigins, allowLocalhost),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(extraHeaders ?? {}),
    },
  })
}

export function ctxJson(
  ctx: PublishContext,
  body: unknown,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  return jsonResponse(body, status, ctx.origin, ctx.allowedOrigins, extraHeaders, ctx.allowLocalhost)
}

export async function hashClient(request: Request, secret: string): Promise<string> {
  const address = extractClientIp(request.headers)
  return hmacSha256Hex(textEncoder.encode(secret), `khoanhkhac:client-ip:v1:${address}`)
}

export async function cleanupR2Keys(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return
  await runWithConcurrency(keys, R2_PARALLEL_CONCURRENCY, async (key) => {
    await deleteR2Object(key).catch(() => undefined)
  })
}

export async function deleteDraftAlbum(dbConfig: SupabaseRestConfig, albumId: string): Promise<boolean> {
  const { data } = await postgrestDelete<Array<{ id: string }>>(
    dbConfig,
    'photobooth_albums',
    `id=eq.${encodeURIComponent(albumId)}&status=eq.draft&select=id`,
  )
  return Boolean(data && data.length > 0)
}

export async function beginAlbumUpload(
  ctx: PublishContext,
  params: {
    clientHash: string
    title: string
    message: string
    totalBytes: number
    maxR2Bytes: number | null
    useR2: boolean
    logContext: string
  },
): Promise<{ ok: true; albumId: string; shareCode: string; durationMs: number } | { ok: false; response: Response }> {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const dbStart = performance.now()
  const beginResult = await postgrestRpc<BeginUploadRow[]>(ctx.dbConfig, 'begin_album_upload', {
    p_client_hash: params.clientHash,
    p_upload_limit: UPLOAD_LIMIT_PER_HOUR,
    p_title: params.title || 'Khoảnh khắc của bạn',
    p_message: params.message || null,
    p_expires_at: expiresAt,
    p_incoming_bytes: params.totalBytes,
    p_max_r2_bytes: params.maxR2Bytes,
    p_global_upload_limit: resolveGlobalUploadLimit(),
  })
  const durationMs = performance.now() - dbStart

  if (beginResult.error) {
    console.error(`begin_album_upload RPC failed during ${params.logContext}`)
    return {
      ok: false,
      response: ctxJson(
        ctx,
        { error: params.useR2 ? R2_QUOTA_LOOKUP_ERROR : 'Không thể bắt đầu tải album.' },
        params.useR2 ? 503 : 500,
      ),
    }
  }

  const row = beginResult.data?.[0]
  if (!row) {
    return { ok: false, response: ctxJson(ctx, { error: 'Không thể tạo album.' }, 500) }
  }
  if (row.status === 'rate_limited') {
    return {
      ok: false,
      response: ctxJson(ctx, { error: 'Thiết bị đã tạo quá nhiều album. Hãy thử lại sau một giờ.' }, 429),
    }
  }
  if (row.status === 'quota_exceeded') {
    return { ok: false, response: ctxJson(ctx, { error: R2_QUOTA_EXCEEDED_ERROR }, 507) }
  }
  if (row.status !== 'ok' || !row.album_id || !row.share_code) {
    return { ok: false, response: ctxJson(ctx, { error: 'Không thể tạo album.' }, 500) }
  }

  return { ok: true, albumId: row.album_id, shareCode: row.share_code, durationMs }
}

export async function loadDraftAlbum(
  ctx: PublishContext,
  albumId: string,
  messages: { logContext: string; lookupError: string; invalidError: string },
): Promise<{ ok: true; album: DraftAlbumRow; durationMs: number } | { ok: false; response: Response }> {
  const lookupStart = performance.now()
  const albumResult = await postgrestSelect<DraftAlbumRow[]>(
    ctx.dbConfig,
    'photobooth_albums',
    `select=id,share_code,status&id=eq.${encodeURIComponent(albumId)}&limit=1`,
  )
  const durationMs = performance.now() - lookupStart

  if (albumResult.error) {
    console.error(`Album lookup failed during ${messages.logContext}`)
    return { ok: false, response: ctxJson(ctx, { error: messages.lookupError }, 500) }
  }
  const album = albumResult.data?.[0]
  if (!album || album.status !== 'draft') {
    return { ok: false, response: ctxJson(ctx, { error: messages.invalidError }, 403) }
  }
  return { ok: true, album, durationMs }
}
