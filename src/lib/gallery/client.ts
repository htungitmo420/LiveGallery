import { normalizeShareCode, parseManifest } from './manifest'
import type { GalleryAlbum, ManifestResponse } from './types'

const MANIFEST_CACHE_PREFIX = 'livegallery-manifest-v1:'
const MANIFEST_CACHE_TTL_MS = 4 * 60 * 1000
const inFlightManifests = new Map<string, Promise<GalleryAlbum>>()
const memoryManifestCache = new Map<string, { expiresAt: number; album: GalleryAlbum }>()
const preconnectedOrigins = new Set<string>()
const preloadedHeroUrls = new Set<string>()

interface CachedManifestEnvelope {
  expiresAt: number
  album: GalleryAlbum
}

export function clearAlbumManifestCache(): void {
  inFlightManifests.clear()
  memoryManifestCache.clear()
  if (typeof sessionStorage !== 'undefined') {
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
        const key = sessionStorage.key(i)
        if (key && key.startsWith(MANIFEST_CACHE_PREFIX)) {
          sessionStorage.removeItem(key)
        }
      }
    } catch {
      /* Ignore storage restrictions. */
    }
  }
}

function readCachedManifest(normalizedCode: string): GalleryAlbum | null {
  const now = Date.now()
  const inMemory = memoryManifestCache.get(normalizedCode)
  if (inMemory) {
    if (inMemory.expiresAt > now) return inMemory.album
    memoryManifestCache.delete(normalizedCode)
  }

  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(`${MANIFEST_CACHE_PREFIX}${normalizedCode}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedManifestEnvelope
    if (!parsed || typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= now || !parsed.album) {
      sessionStorage.removeItem(`${MANIFEST_CACHE_PREFIX}${normalizedCode}`)
      return null
    }
    memoryManifestCache.set(normalizedCode, { expiresAt: parsed.expiresAt, album: parsed.album })
    return parsed.album
  } catch {
    return null
  }
}

function writeCachedManifest(normalizedCode: string, album: GalleryAlbum): void {
  const expiresAt = Date.now() + MANIFEST_CACHE_TTL_MS
  memoryManifestCache.set(normalizedCode, { expiresAt, album })
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(
      `${MANIFEST_CACHE_PREFIX}${normalizedCode}`,
      JSON.stringify({ expiresAt, album } satisfies CachedManifestEnvelope),
    )
  } catch {
    /* Storage quota or private browsing may block writes. */
  }
}

function warmHeroMediaHints(album: GalleryAlbum): void {
  if (typeof document === 'undefined' || !document.head) return
  const hero = album.items[0]
  if (!hero) return

  try {
    const mediaOrigin = new URL(hero.url).origin
    if (mediaOrigin && !preconnectedOrigins.has(mediaOrigin)) {
      preconnectedOrigins.add(mediaOrigin)
      const preconnect = document.createElement('link')
      preconnect.rel = 'preconnect'
      preconnect.href = mediaOrigin
      preconnect.crossOrigin = 'anonymous'
      document.head.appendChild(preconnect)
    }
  } catch {
    /* Ignore non-standard URLs. */
  }

  if (!preloadedHeroUrls.has(hero.url)) {
    preloadedHeroUrls.add(hero.url)
    const preload = document.createElement('link')
    preload.rel = 'preload'
    preload.as = 'image'
    preload.href = hero.url
    preload.crossOrigin = 'anonymous'
    document.head.appendChild(preload)
  }
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) {
    return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'))
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
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
  options?: { bypassCache?: boolean },
): Promise<GalleryAlbum> {
  const endpoint = getManifestEndpoint()
  const normalized = normalizeShareCode(code)

  if (!endpoint) {
    throw new Error('LiveGallery chưa được kết nối với máy chủ album.')
  }
  if (!normalized) {
    throw new Error('Mã album không hợp lệ.')
  }

  if (!options?.bypassCache) {
    const cached = readCachedManifest(normalized)
    if (cached) {
      warmHeroMediaHints(cached)
      return cached
    }
    const existing = inFlightManifests.get(normalized)
    if (existing) {
      return raceWithAbort(existing, signal)
    }
  }

  const requestTask = (async () => {
    const response = await fetch(
      `${endpoint}?code=${encodeURIComponent(normalized)}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: options?.bypassCache ? 'no-store' : 'default',
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

    const parsed = parseManifest(payload)
    writeCachedManifest(normalized, parsed)
    warmHeroMediaHints(parsed)
    return parsed
  })()

  if (!options?.bypassCache) {
    inFlightManifests.set(normalized, requestTask)
  }

  requestTask.finally(() => {
    if (inFlightManifests.get(normalized) === requestTask) {
      inFlightManifests.delete(normalized)
    }
  })

  return raceWithAbort(requestTask, signal)
}

export function prefetchAlbum(code: string): void {
  const normalized = normalizeShareCode(code)
  if (!normalized || !getManifestEndpoint()) return
  void fetchAlbum(normalized).catch(() => undefined)
}
