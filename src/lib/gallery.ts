export type GalleryMediaKind = 'image' | 'gif' | 'video'

export interface GalleryMedia {
  id: string
  kind: GalleryMediaKind
  url: string
  thumbnailUrl: string | null
  mimeType: string
  fileName: string
  width: number | null
  height: number | null
  durationMs: number | null
  sortOrder: number
}

export interface GalleryAlbum {
  shareCode: string
  title: string
  message: string | null
  createdAt: string
  expiresAt: string | null
  items: GalleryMedia[]
}

interface ManifestResponse {
  album?: unknown
  items?: unknown
  error?: unknown
}

const CODE_PATTERN = /^[a-z0-9_-]{6,64}$/i

export function normalizeShareCode(value: string): string {
  const code = value.trim()
  return CODE_PATTERN.test(code) ? code.toLowerCase() : ''
}

export function getShareCodeFromPath(pathname: string): string {
  const match = pathname.match(/^\/i\/([^/]+)\/?$/i)
  if (!match) return ''

  try {
    return normalizeShareCode(decodeURIComponent(match[1]))
  } catch {
    return ''
  }
}

export function buildAlbumPath(code: string): string {
  const normalized = normalizeShareCode(code)
  return normalized ? `/i/${encodeURIComponent(normalized)}` : '/'
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function parseManifest(payload: ManifestResponse): GalleryAlbum {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Dữ liệu album không hợp lệ.')
  }

  const album = payload.album
  if (!album || typeof album !== 'object') {
    throw new Error(stringOrEmpty(payload.error) || 'Không tìm thấy album.')
  }

  const record = album as Record<string, unknown>
  const shareCode = normalizeShareCode(stringOrEmpty(record.shareCode))
  const title = stringOrEmpty(record.title).trim()
  const createdAt = stringOrEmpty(record.createdAt)
  const rawItems = Array.isArray(payload.items) ? payload.items : []

  if (!shareCode || !title || Number.isNaN(Date.parse(createdAt))) {
    throw new Error('Dữ liệu album chưa đầy đủ.')
  }

  const items = rawItems.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Dữ liệu ảnh không hợp lệ.')
    }

    const media = entry as Record<string, unknown>
    const kind = media.kind
    const url = stringOrEmpty(media.url)
    const id = stringOrEmpty(media.id)

    if (!id || !url || (kind !== 'image' && kind !== 'gif' && kind !== 'video')) {
      throw new Error('Dữ liệu ảnh không hợp lệ.')
    }

    return {
      id,
      kind,
      url,
      thumbnailUrl: nullableString(media.thumbnailUrl),
      mimeType: stringOrEmpty(media.mimeType),
      fileName: stringOrEmpty(media.fileName) || `khoanh-khac-${index + 1}`,
      width: nullableNumber(media.width),
      height: nullableNumber(media.height),
      durationMs: nullableNumber(media.durationMs),
      sortOrder:
        typeof media.sortOrder === 'number' && Number.isInteger(media.sortOrder)
          ? media.sortOrder
          : index,
    } satisfies GalleryMedia
  })

  return {
    shareCode,
    title,
    message: nullableString(record.message),
    createdAt,
    expiresAt: nullableString(record.expiresAt),
    items,
  }
}

export function getManifestEndpoint(): string {
  const explicitUrl = import.meta.env.VITE_GALLERY_API_URL?.trim()
  if (explicitUrl) return explicitUrl.replace(/\/$/, '')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  if (supabaseUrl) {
    return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/album-manifest`
  }

  return ''
}

export async function fetchAlbum(
  code: string,
  signal?: AbortSignal,
): Promise<GalleryAlbum> {
  const endpoint = getManifestEndpoint()
  const normalized = normalizeShareCode(code)

  if (!endpoint) {
    throw new Error('LiveGallery chưa được kết nối với máy chủ album.')
  }
  if (!normalized) {
    throw new Error('Mã album không hợp lệ.')
  }

  const response = await fetch(
    `${endpoint}?code=${encodeURIComponent(normalized)}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    },
  )

  const payload = (await response.json().catch(() => ({}))) as ManifestResponse
  if (!response.ok) {
    const message =
      typeof payload.error === 'string'
        ? payload.error
        : 'Không thể tải album lúc này.'
    throw new Error(message)
  }

  return parseManifest(payload)
}
