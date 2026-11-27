import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_RECENT_ALBUMS,
  clearRecentAlbums,
  readRecentAlbums,
  recordRecentAlbum,
  removeRecentAlbumEntry,
} from '../src/lib/recentAlbums'

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() { return store.size },
    clear() { store.clear() },
    getItem(key: string) { return store.get(key) ?? null },
    key(index: number) { return Array.from(store.keys())[index] ?? null },
    removeItem(key: string) { store.delete(key) },
    setItem(key: string, value: string) { store.set(key, value) },
  }
}

describe('recent albums persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('records newest albums first, persists itemCount, deduplicates share codes, and caps at MAX_RECENT_ALBUMS', () => {
    for (let i = 1; i <= MAX_RECENT_ALBUMS + 2; i += 1) {
      recordRecentAlbum({
        shareCode: `album${String(i).padStart(2, '0')}`,
        title: `Album ${i}`,
        itemCount: i,
      })
    }
    recordRecentAlbum({
      shareCode: 'ALBUM04',
      title: 'Album 4 Updated',
      items: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    })

    const entries = readRecentAlbums()
    expect(entries).toHaveLength(MAX_RECENT_ALBUMS)
    expect(entries[0].shareCode).toBe('album04')
    expect(entries[0].title).toBe('Album 4 Updated')
    expect(entries[0].itemCount).toBe(9)
    expect(entries[1].shareCode).toBe(`album${String(MAX_RECENT_ALBUMS + 2).padStart(2, '0')}`)
  })

  it('preserves backwards compatibility with legacy entries without itemCount and clears all cleanly', () => {
    localStorage.setItem(
      'livegallery-recent-albums',
      JSON.stringify([
        { shareCode: 'legacy01', title: 'Legacy Album', openedAt: '2026-11-26T10:00:00.000Z' },
      ]),
    )

    const loaded = readRecentAlbums()
    expect(loaded).toEqual([
      { shareCode: 'legacy01', title: 'Legacy Album', openedAt: '2026-11-26T10:00:00.000Z' },
    ])

    expect(clearRecentAlbums()).toEqual([])
    expect(readRecentAlbums()).toEqual([])
  })

  it('removes a single album entry and ignores invalid stored data', () => {
    recordRecentAlbum({ shareCode: 'album01', title: 'Album 1' })
    recordRecentAlbum({ shareCode: 'album02', title: 'Album 2' })

    const remaining = removeRecentAlbumEntry('ALBUM01')
    expect(remaining.map((item) => item.shareCode)).toEqual(['album02'])
    expect(readRecentAlbums().map((item) => item.shareCode)).toEqual(['album02'])

    localStorage.setItem('livegallery-recent-albums', 'not-json')
    expect(readRecentAlbums()).toEqual([])
  })
})
