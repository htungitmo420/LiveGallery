import type { GalleryAlbum, GalleryMedia, ManifestResponse } from './types'

const CODE_PATTERN = /^[a-z0-9_-]{6,64}$/i
const SAFE_RASTER_DATA_URL_PATTERN = /^data:image\/(?:png|jpeg|webp|gif)(?:;[a-z0-9=._+-]+)*,/i

function hasControlChar(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function isSafeHttpOrHttpsUrl(parsed: URL): boolean {
  if (parsed.username || parsed.password) return false
  if (parsed.protocol === 'https:') return Boolean(parsed.hostname)
  if (parsed.protocol === 'http:') {
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  }
  return false
}

export function isSafeMediaUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false
  const trimmed = raw.trim()
  if (!trimmed || hasControlChar(trimmed)) return false

  if (/^data:/i.test(trimmed)) {
    return SAFE_RASTER_DATA_URL_PATTERN.test(trimmed)
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return false
  }

  if (isSafeHttpOrHttpsUrl(parsed)) return true

  if (parsed.protocol === 'blob:') {
    const inner = trimmed.slice(5)
    if (inner.startsWith('nodedata:') || inner.startsWith('null/')) {
      return true
    }
    try {
      return isSafeHttpOrHttpsUrl(new URL(inner))
    } catch {
      return false
    }
  }

  return false
}

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

  const items = rawItems
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error('Dữ liệu ảnh không hợp lệ.')
      }

      const media = entry as Record<string, unknown>
      const kind = media.kind
      const url = stringOrEmpty(media.url).trim()
      const id = stringOrEmpty(media.id)

      if (!id || !isSafeMediaUrl(url) || (kind !== 'image' && kind !== 'gif' && kind !== 'video')) {
        throw new Error('Dữ liệu ảnh không hợp lệ.')
      }

      const rawThumb = nullableString(media.thumbnailUrl)?.trim() ?? null
      const thumbnailUrl = rawThumb && isSafeMediaUrl(rawThumb) ? rawThumb : null

      return {
        id,
        kind,
        url,
        thumbnailUrl,
        mimeType: stringOrEmpty(media.mimeType),
        fileName: stringOrEmpty(media.fileName) || `photo-${index + 1}`,
        width: nullableNumber(media.width),
        height: nullableNumber(media.height),
        durationMs: nullableNumber(media.durationMs),
        sortOrder:
          typeof media.sortOrder === 'number' && Number.isInteger(media.sortOrder)
            ? media.sortOrder
            : index,
      } satisfies GalleryMedia
    })

  const decor = payload.decor && typeof payload.decor === 'object'
    ? payload.decor as Record<string, unknown>
    : {}
  const stickers = (Array.isArray(decor.stickers) ? decor.stickers : []).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const sticker = entry as Record<string, unknown>
    const id = stringOrEmpty(sticker.id)
    const name = stringOrEmpty(sticker.name)
    const url = stringOrEmpty(sticker.url).trim()
    if (!id || !name || !isSafeMediaUrl(url)) return []
    return [{ id, name, url, category: stringOrEmpty(sticker.category) || 'cute' }]
  })
  const backgrounds = (Array.isArray(decor.backgrounds) ? decor.backgrounds : []).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const background = entry as Record<string, unknown>
    const id = stringOrEmpty(background.id)
    const name = stringOrEmpty(background.name)
    const url = stringOrEmpty(background.url).trim()
    return id && name && isSafeMediaUrl(url) ? [{ id, name, url }] : []
  })

  return {
    shareCode,
    title,
    message: nullableString(record.message),
    createdAt,
    expiresAt: nullableString(record.expiresAt),
    items,
    stickers,
    backgrounds,
  }
}
