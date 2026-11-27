import { normalizeShareCode, type GalleryAlbum } from './gallery'

const RECENT_ALBUMS_STORAGE_KEY = 'livegallery-recent-albums'
export const MAX_RECENT_ALBUMS = 8

export interface RecentAlbumEntry {
  shareCode: string
  title: string
  openedAt: string
  itemCount?: number
}

function parseItemCount(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined
  const rounded = Math.floor(raw)
  return rounded >= 0 ? rounded : undefined
}

export function readRecentAlbums(): RecentAlbumEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_ALBUMS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const valid: RecentAlbumEntry[] = []
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue
      const record = entry as Record<string, unknown>
      const shareCode = normalizeShareCode(typeof record.shareCode === 'string' ? record.shareCode : '')
      const title = typeof record.title === 'string' ? record.title.trim() : ''
      const openedAt = typeof record.openedAt === 'string' ? record.openedAt : ''
      const itemCount = parseItemCount(record.itemCount)
      if (!shareCode || !title || seen.has(shareCode)) continue
      seen.add(shareCode)
      valid.push(itemCount === undefined ? { shareCode, title, openedAt } : { shareCode, title, openedAt, itemCount })
      if (valid.length >= MAX_RECENT_ALBUMS) break
    }
    return valid
  } catch {
    return []
  }
}

export function recordRecentAlbum(
  album: Pick<GalleryAlbum, 'shareCode' | 'title'> & {
    items?: readonly unknown[]
    itemCount?: number
  },
): void {
  try {
    const shareCode = normalizeShareCode(album.shareCode)
    const title = album.title.trim()
    if (!shareCode || !title) return
    const itemCount = parseItemCount(album.itemCount ?? album.items?.length)
    const entry: RecentAlbumEntry = {
      shareCode,
      title,
      openedAt: new Date().toISOString(),
      ...(itemCount === undefined ? {} : { itemCount }),
    }
    const next: RecentAlbumEntry[] = [
      entry,
      ...readRecentAlbums().filter((item) => item.shareCode !== shareCode),
    ].slice(0, MAX_RECENT_ALBUMS)
    localStorage.setItem(RECENT_ALBUMS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* Storage is optional. */
  }
}

export function removeRecentAlbumEntry(shareCode: string): RecentAlbumEntry[] {
  const normalized = normalizeShareCode(shareCode)
  const next = readRecentAlbums().filter((item) => item.shareCode !== normalized)
  try {
    localStorage.setItem(RECENT_ALBUMS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* Storage is optional. */
  }
  return next
}

export function clearRecentAlbums(): RecentAlbumEntry[] {
  try {
    localStorage.removeItem(RECENT_ALBUMS_STORAGE_KEY)
  } catch {
    /* Storage is optional. */
  }
  return []
}
