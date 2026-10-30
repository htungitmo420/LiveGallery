export type GalleryMediaKind = 'image' | 'gif'

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
  stickers: GalleryStickerAsset[]
  backgrounds: GalleryBackgroundAsset[]
}

export interface GalleryStickerAsset {
  id: string
  name: string
  category: string
  url: string
}

export interface GalleryBackgroundAsset {
  id: string
  name: string
  url: string
}

interface ManifestResponse {
  album?: unknown
  items?: unknown
  decor?: unknown
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

  const items = rawItems.filter((entry) => {
    if (!entry || typeof entry !== 'object') return true
    return (entry as Record<string, unknown>).kind !== 'video'
  }).map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Dữ liệu ảnh không hợp lệ.')
    }

    const media = entry as Record<string, unknown>
    const kind = media.kind
    const url = stringOrEmpty(media.url)
    const id = stringOrEmpty(media.id)

    if (!id || !url || (kind !== 'image' && kind !== 'gif')) {
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

  const decor = payload.decor && typeof payload.decor === 'object'
    ? payload.decor as Record<string, unknown>
    : {}
  const stickers = (Array.isArray(decor.stickers) ? decor.stickers : []).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const sticker = entry as Record<string, unknown>
    const id = stringOrEmpty(sticker.id)
    const name = stringOrEmpty(sticker.name)
    const url = stringOrEmpty(sticker.url)
    if (!id || !name || !url) return []
    return [{ id, name, url, category: stringOrEmpty(sticker.category) || 'cute' }]
  })
  const backgrounds = (Array.isArray(decor.backgrounds) ? decor.backgrounds : []).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const background = entry as Record<string, unknown>
    const id = stringOrEmpty(background.id)
    const name = stringOrEmpty(background.name)
    const url = stringOrEmpty(background.url)
    return id && name && url ? [{ id, name, url }] : []
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

export type MobilePlatform = 'ios' | 'android' | 'desktop'

export interface SaveMediaOutcome {
  status: 'shared' | 'downloaded' | 'cancelled' | 'manual'
  file: File
  previewUrl?: string
  canRetryShare?: boolean
}

export function detectMobilePlatform(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  maxTouchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
): MobilePlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios'
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios'
  if (/Android/i.test(userAgent)) return 'android'
  if (/Mobile/i.test(userAgent)) return 'android'
  return 'desktop'
}

export function isMobileDevice(
  userAgent?: string,
  maxTouchPoints?: number,
): boolean {
  return detectMobilePlatform(userAgent, maxTouchPoints) !== 'desktop'
}

export function normalizeMediaFileName(
  fileName: string,
  mimeType: string,
  fallbackBase = 'khoanh-khac',
): string {
  const cleanMime = mimeType.split(';', 1)[0].trim().toLowerCase()
  const ext = cleanMime === 'image/gif'
    ? 'gif'
    : cleanMime === 'image/png'
      ? 'png'
      : 'jpg'
  const trimmed = fileName.trim()
  const withoutExt = trimmed ? trimmed.replace(/\.[a-z0-9]+$/i, '') : fallbackBase
  const base = withoutExt
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '') || fallbackBase
  return `${base}.${ext}`
}

export function canShareMediaFile(file: File): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return false
  }
  if (typeof navigator.canShare === 'function') {
    try {
      return navigator.canShare({ files: [file] })
    } catch {
      return false
    }
  }
  return true
}

export async function fileToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result)
        else reject(new Error('Không thể tạo bản xem trước ảnh.'))
      }
      reader.onerror = () => reject(new Error('Không thể tạo bản xem trước ảnh.'))
      reader.readAsDataURL(blob)
    })
  }
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  const mime = blob.type || 'image/jpeg'
  return `data:${mime};base64,${btoa(binary)}`
}

export function triggerBrowserDownload(file: File): void {
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.style.display = 'none'
  anchor.href = url
  anchor.download = file.name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function shareMediaFileImmediately(file: File): Promise<boolean> {
  if (!canShareMediaFile(file)) return false
  try {
    await navigator.share({ files: [file] })
    return true
  } catch {
    return false
  }
}

export async function saveMediaFileToDevice(file: File): Promise<SaveMediaOutcome> {
  if (isMobileDevice()) {
    const shareSupported = canShareMediaFile(file)
    if (shareSupported) {
      try {
        // Keep the share payload strictly to { files } so iOS Safari and Android
        // treat the item as media and expose "Save Image" / "Save to Photos".
        await navigator.share({ files: [file] })
        return { status: 'shared', file }
      } catch (error) {
        const errorName = (error as { name?: string } | null)?.name
        if (errorName === 'AbortError') {
          return { status: 'cancelled', file }
        }
        const previewUrl = await fileToDataUrl(file)
        return { status: 'manual', file, previewUrl, canRetryShare: true }
      }
    }

    const previewUrl = await fileToDataUrl(file)
    return { status: 'manual', file, previewUrl, canRetryShare: false }
  }

  triggerBrowserDownload(file)
  return { status: 'downloaded', file }
}

async function convertBlobToJpeg(blob: Blob): Promise<Blob> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return new Blob([blob], { type: 'image/jpeg' })
  }
  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Không thể xử lý định dạng ảnh.'))
      element.src = objectUrl
    })
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) return new Blob([blob], { type: 'image/jpeg' })
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return new Blob([blob], { type: 'image/jpeg' })
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    const converted = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.96),
    )
    return converted ?? new Blob([blob], { type: 'image/jpeg' })
  } catch {
    return new Blob([blob], { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const mediaFileCache = new Map<string, Promise<File>>()

export function clearMediaFileCache(): void {
  mediaFileCache.clear()
}

export async function prepareGalleryMediaFile(
  item: GalleryMedia,
  options?: { bypassCache?: boolean },
): Promise<File> {
  const cacheKey = item.url
  if (!options?.bypassCache) {
    const cached = mediaFileCache.get(cacheKey)
    if (cached) return cached
  }

  const task = (async () => {
    const response = await fetch(
      item.url,
      options?.bypassCache ? { cache: 'no-store' } : undefined,
    )
    if (!response.ok) throw new Error('Liên kết ảnh đã hết hạn.')
    const rawBlob = await response.blob()
    const rawMime = (rawBlob.type || item.mimeType || '').split(';', 1)[0].trim().toLowerCase()

    if (item.kind === 'gif' || rawMime === 'image/gif') {
      const gifBlob = rawBlob.type === 'image/gif' ? rawBlob : new Blob([rawBlob], { type: 'image/gif' })
      const fileName = normalizeMediaFileName(item.fileName, 'image/gif', 'khoanh-khac')
      return new File([gifBlob], fileName, { type: 'image/gif', lastModified: Date.now() })
    }

    const jpegBlob = rawMime === 'image/jpeg'
      ? (rawBlob.type === 'image/jpeg' ? rawBlob : new Blob([rawBlob], { type: 'image/jpeg' }))
      : await convertBlobToJpeg(rawBlob)
    const fileName = normalizeMediaFileName(item.fileName, 'image/jpeg', 'khoanh-khac')
    return new File([jpegBlob], fileName, { type: 'image/jpeg', lastModified: Date.now() })
  })()

  mediaFileCache.set(cacheKey, task)
  task.catch(() => {
    if (mediaFileCache.get(cacheKey) === task) {
      mediaFileCache.delete(cacheKey)
    }
  })

  return task
}

export function preloadGalleryMedia(item: GalleryMedia | undefined): void {
  if (!item) return
  void prepareGalleryMediaFile(item).catch(() => undefined)
}

export async function downloadGalleryMedia(
  item: GalleryMedia,
  options?: { bypassCache?: boolean },
): Promise<SaveMediaOutcome> {
  const file = await prepareGalleryMediaFile(item, options)
  return saveMediaFileToDevice(file)
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
