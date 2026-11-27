import {
  getManifestEndpoint,
  isSafeMediaUrl,
  type GalleryBackgroundAsset,
  type GalleryStickerAsset,
} from '../gallery'
import { FALLBACK_DIY_FRAMES } from './geometry'
import type { DiyCatalog, DiyFrame, DiyFrameConfig, DiyLayoutId } from './types'

const CATALOG_CACHE_KEY = 'livegallery-diy-catalog-v1'
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000
const VALID_LAYOUT_IDS = new Set<DiyLayoutId>(['strip3', 'strip4', 'grid4', 'polaroid'])

let memoryCatalogCache: { expiresAt: number; value: DiyCatalog } | null = null
let inFlightCatalog: Promise<DiyCatalog> | null = null

export function clearDiyCatalogCache(): void {
  memoryCatalogCache = null
  inFlightCatalog = null
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(CATALOG_CACHE_KEY)
    } catch {
      /* Ignore storage restrictions. */
    }
  }
}

function parseFrameConfig(raw: unknown): DiyFrameConfig {
  const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const background = typeof record.background === 'string' && record.background.trim()
    ? record.background.trim()
    : '#ffffff'
  const accent = typeof record.accent === 'string' && record.accent.trim()
    ? record.accent.trim()
    : '#171412'
  const textColor = typeof record.textColor === 'string' && record.textColor.trim()
    ? record.textColor.trim()
    : '#171412'
  const radius = typeof record.radius === 'number' && Number.isFinite(record.radius) && record.radius >= 0
    ? record.radius
    : 20
  return { background, accent, textColor, radius }
}

function parseLayoutId(raw: unknown): DiyLayoutId | undefined {
  if (typeof raw === 'string' && VALID_LAYOUT_IDS.has(raw as DiyLayoutId)) {
    return raw as DiyLayoutId
  }
  return undefined
}

function positiveInt(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.round(raw)
  }
  return undefined
}

function buildPublicStorageUrl(supabaseUrl: string, bucket: string, path: string): string {
  const base = supabaseUrl.replace(/\/+$/, '')
  const encodedPath = path.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')
  return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`
}

export function parseDiyCatalogPayload(payload: unknown): DiyCatalog {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  const rawFrames = Array.isArray(record.frames) ? record.frames : []
  const rawDecor = record.decor && typeof record.decor === 'object'
    ? record.decor as Record<string, unknown>
    : {}

  const seenFrames = new Set<string>()
  const remoteFrames: DiyFrame[] = []
  for (const item of rawFrames) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    const name = typeof row.name === 'string' ? row.name.trim() : ''
    if (!id || !name || seenFrames.has(id)) continue

    const rawUrl = typeof row.assetUrl === 'string' ? row.assetUrl.trim() : ''
    if (rawUrl && !isSafeMediaUrl(rawUrl)) continue

    seenFrames.add(id)
    remoteFrames.push({
      id,
      name,
      description: typeof row.description === 'string' ? row.description.trim() : '',
      config: parseFrameConfig(row.config),
      assetUrl: rawUrl || undefined,
      layoutId: parseLayoutId(row.layoutId),
      assetWidth: positiveInt(row.assetWidth),
      assetHeight: positiveInt(row.assetHeight),
      source: 'remote',
    })
  }

  const rawStickers = Array.isArray(rawDecor.stickers) ? rawDecor.stickers : []
  const stickers: GalleryStickerAsset[] = rawStickers.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    const name = typeof row.name === 'string' ? row.name.trim() : ''
    const url = typeof row.url === 'string' ? row.url.trim() : ''
    const category = typeof row.category === 'string' && row.category.trim() ? row.category.trim() : 'cute'
    if (!id || !name || !isSafeMediaUrl(url)) return []
    return [{ id, name, category, url }]
  })

  const rawBackgrounds = Array.isArray(rawDecor.backgrounds) ? rawDecor.backgrounds : []
  const backgrounds: GalleryBackgroundAsset[] = rawBackgrounds.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    const name = typeof row.name === 'string' ? row.name.trim() : ''
    const url = typeof row.url === 'string' ? row.url.trim() : ''
    if (!id || !name || !isSafeMediaUrl(url)) return []
    return [{ id, name, url }]
  })

  const mergedFrames: DiyFrame[] = remoteFrames.length > 0
    ? [
        ...remoteFrames,
        ...FALLBACK_DIY_FRAMES.filter((builtin) => !seenFrames.has(builtin.id)),
      ]
    : [...FALLBACK_DIY_FRAMES]

  return {
    frames: mergedFrames,
    stickers,
    backgrounds,
    remote: remoteFrames.length > 0 || stickers.length > 0 || backgrounds.length > 0,
  }
}

function readCachedCatalog(): DiyCatalog | null {
  const now = Date.now()
  if (memoryCatalogCache) {
    if (memoryCatalogCache.expiresAt > now) return memoryCatalogCache.value
    memoryCatalogCache = null
  }
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(CATALOG_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { expiresAt?: unknown; value?: unknown }
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= now || !parsed.value) {
      sessionStorage.removeItem(CATALOG_CACHE_KEY)
      return null
    }
    const catalog = parsed.value as DiyCatalog
    memoryCatalogCache = { expiresAt: parsed.expiresAt, value: catalog }
    return catalog
  } catch {
    return null
  }
}

function writeCachedCatalog(value: DiyCatalog): void {
  const expiresAt = Date.now() + CATALOG_CACHE_TTL_MS
  memoryCatalogCache = { expiresAt, value }
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ expiresAt, value }))
  } catch {
    /* Storage is optional. */
  }
}

async function fetchDirectPostgrestCatalog(): Promise<DiyCatalog | null> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anonKey = (
    import.meta.env.VITE_SUPABASE_ANON_KEY
    ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  )?.trim()
  if (!supabaseUrl || !anonKey) return null

  const base = supabaseUrl.replace(/\/+$/, '')
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    Accept: 'application/json',
  }

  try {
    const [framesRes, stickersRes, backgroundsRes] = await Promise.all([
      fetch(
        `${base}/rest/v1/photobooth_frames?select=id,name,description,config,asset_path,layout_id,asset_width,asset_height&is_published=eq.true&order=sort_order.asc,name.asc`,
        { headers },
      ),
      fetch(
        `${base}/rest/v1/photobooth_stickers?select=id,name,category,asset_path&is_published=eq.true&order=sort_order.asc`,
        { headers },
      ),
      fetch(
        `${base}/rest/v1/photobooth_backgrounds?select=id,name,asset_path&is_published=eq.true&order=sort_order.asc,name.asc`,
        { headers },
      ),
    ])

    const framesData = framesRes.ok ? await framesRes.json() : []
    const stickersData = stickersRes.ok ? await stickersRes.json() : []
    const backgroundsData = backgroundsRes.ok ? await backgroundsRes.json() : []

    const frames = Array.isArray(framesData)
      ? framesData.map((row: Record<string, unknown>) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          config: row.config,
          assetUrl: typeof row.asset_path === 'string' && row.asset_path
            ? buildPublicStorageUrl(base, 'photobooth-frames', row.asset_path)
            : null,
          layoutId: row.layout_id,
          assetWidth: row.asset_width,
          assetHeight: row.asset_height,
        }))
      : []
    const stickers = Array.isArray(stickersData)
      ? stickersData
          .filter((row: Record<string, unknown>) => row.category !== 'text' && row.category !== 'shapes')
          .map((row: Record<string, unknown>) => ({
            id: row.id,
            name: row.name,
            category: row.category,
            url: typeof row.asset_path === 'string' && row.asset_path
              ? buildPublicStorageUrl(base, 'photobooth-stickers', row.asset_path)
              : '',
          }))
      : []
    const backgrounds = Array.isArray(backgroundsData)
      ? backgroundsData.map((row: Record<string, unknown>) => ({
          id: row.id,
          name: row.name,
          url: typeof row.asset_path === 'string' && row.asset_path
            ? buildPublicStorageUrl(base, 'photobooth-background', row.asset_path)
            : '',
        }))
      : []

    return parseDiyCatalogPayload({ frames, decor: { stickers, backgrounds } })
  } catch {
    return null
  }
}

export async function fetchDiyCatalog(options?: { bypassCache?: boolean }): Promise<DiyCatalog> {
  if (!options?.bypassCache) {
    const cached = readCachedCatalog()
    if (cached) return cached
    if (inFlightCatalog) return inFlightCatalog
  }

  const task = (async (): Promise<DiyCatalog> => {
    const endpoint = getManifestEndpoint()
    if (endpoint) {
      try {
        const response = await fetch(`${endpoint}?catalog=1`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: options?.bypassCache ? 'no-store' : 'default',
        })
        if (response.ok) {
          const payload = (await response.json().catch(() => ({}))) as unknown
          const catalog = parseDiyCatalogPayload(payload)
          if (catalog.remote) {
            writeCachedCatalog(catalog)
            return catalog
          }
        }
      } catch {
        /* Fall through to direct PostgREST or built-in catalog. */
      }
    }

    const direct = await fetchDirectPostgrestCatalog()
    if (direct && direct.remote) {
      writeCachedCatalog(direct)
      return direct
    }

    return {
      frames: [...FALLBACK_DIY_FRAMES],
      stickers: [],
      backgrounds: [],
      remote: false,
    }
  })()

  if (!options?.bypassCache) {
    inFlightCatalog = task
  }
  task.finally(() => {
    if (inFlightCatalog === task) {
      inFlightCatalog = null
    }
  })
  return task
}
