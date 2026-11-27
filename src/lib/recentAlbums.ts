import { normalizeShareCode, type GalleryAlbum } from './gallery'

const RECENT_ALBUMS_STORAGE_KEY = 'livegallery-recent-albums'
const MAX_RECENT_ALBUMS = 4

export interface RecentAlbumEntry {
  shareCode: string
  title: string
  openedAt: string
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
      if (!shareCode || !title || seen.has(shareCode)) continue
      seen.add(shareCode)
      valid.push({ shareCode, title, openedAt })
      if (valid.length >= MAX_RECENT_ALBUMS) break
    }
    return valid
  } catch {
    return []
  }
}

export function recordRecentAlbum(album: Pick<GalleryAlbum, 'shareCode' | 'title'>): void {
  try {
    const next: RecentAlbumEntry[] = [
      {
        shareCode: album.shareCode,
        title: album.title,
        openedAt: new Date().toISOString(),
      },
      ...readRecentAlbums().filter((item) => item.shareCode !== album.shareCode),
    ].slice(0, MAX_RECENT_ALBUMS)
    localStorage.setItem(RECENT_ALBUMS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* Storage is optional. */
  }
}

export function removeRecentAlbumEntry(shareCode: string): RecentAlbumEntry[] {
  const next = readRecentAlbums().filter((item) => item.shareCode !== shareCode)
  try {
    localStorage.setItem(RECENT_ALBUMS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* Storage is optional. */
  }
  return next
}
