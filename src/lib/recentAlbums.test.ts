import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readRecentAlbums, recordRecentAlbum, removeRecentAlbumEntry } from './recentAlbums'

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

  it('records newest albums first, deduplicates share codes, and caps at 4 entries', () => {
    recordRecentAlbum({ shareCode: 'album01', title: 'Album 1' })
    recordRecentAlbum({ shareCode: 'album02', title: 'Album 2' })
    recordRecentAlbum({ shareCode: 'album03', title: 'Album 3' })
    recordRecentAlbum({ shareCode: 'album04', title: 'Album 4' })
    recordRecentAlbum({ shareCode: 'album05', title: 'Album 5' })
    recordRecentAlbum({ shareCode: 'album02', title: 'Album 2 Updated' })

    const entries = readRecentAlbums()
    expect(entries.map((item) => item.shareCode)).toEqual(['album02', 'album05', 'album04', 'album03'])
    expect(entries[0].title).toBe('Album 2 Updated')
  })

  it('removes a single album entry and ignores invalid stored data', () => {
    recordRecentAlbum({ shareCode: 'album01', title: 'Album 1' })
    recordRecentAlbum({ shareCode: 'album02', title: 'Album 2' })

    const remaining = removeRecentAlbumEntry('album01')
    expect(remaining.map((item) => item.shareCode)).toEqual(['album02'])
    expect(readRecentAlbums().map((item) => item.shareCode)).toEqual(['album02'])

    localStorage.setItem('livegallery-recent-albums', 'not-json')
    expect(readRecentAlbums()).toEqual([])
  })
})
