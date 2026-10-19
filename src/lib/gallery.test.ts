import { describe, expect, it } from 'vitest'
import {
  buildAlbumPath,
  getShareCodeFromPath,
  normalizeShareCode,
  parseManifest,
} from './gallery'

describe('share code routing', () => {
  it('normalizes valid codes', () => {
    expect(normalizeShareCode('  AbC_123  ')).toBe('abc_123')
    expect(buildAlbumPath(' AbC_123 ')).toBe('/i/abc_123')
  })

  it('rejects malformed routes and codes', () => {
    expect(normalizeShareCode('x')).toBe('')
    expect(getShareCodeFromPath('/album/abc123')).toBe('')
    expect(getShareCodeFromPath('/i/abc 123')).toBe('')
  })

  it('reads a share code from an album URL', () => {
    expect(getShareCodeFromPath('/i/D44092/')).toBe('d44092')
  })
})

describe('manifest parsing', () => {
  it('accepts image items and omits legacy videos', () => {
    const album = parseManifest({
      album: {
        shareCode: 'D44092',
        title: 'Sinh nhật của Mai',
        message: 'Một ngày thật vui!',
        createdAt: '2026-10-18T12:00:00.000Z',
        expiresAt: null,
      },
      items: [
        {
          id: 'image-1',
          kind: 'image',
          url: 'https://example.com/image.jpg',
          thumbnailUrl: null,
          mimeType: 'image/jpeg',
          fileName: 'image.jpg',
          width: 1200,
          height: 1800,
          durationMs: null,
          sortOrder: 0,
        },
        {
          id: 'video-1',
          kind: 'video',
          url: 'https://example.com/video.mp4',
          thumbnailUrl: 'https://example.com/thumb.jpg',
          mimeType: 'video/mp4',
          fileName: 'video.mp4',
          width: 1080,
          height: 1920,
          durationMs: 6000,
          sortOrder: 1,
        },
      ],
    })

    expect(album.shareCode).toBe('d44092')
    expect(album.items).toHaveLength(1)
    expect(album.items[0].kind).toBe('image')
    expect(album.stickers).toEqual([])
    expect(album.backgrounds).toEqual([])
  })

  it('reads the decor catalog while ignoring malformed entries', () => {
    const album = parseManifest({
      album: { shareCode: 'decor01', title: 'Decor', createdAt: '2026-10-20T12:00:00.000Z' },
      items: [],
      decor: {
        stickers: [{ id: 'heart', name: 'Trái tim', category: 'cute', url: 'https://example.com/heart.png' }, null],
        backgrounds: [{ id: 'paper', name: 'Giấy', url: 'https://example.com/paper.jpg' }, { id: '', name: 'Sai', url: '' }],
      },
    })
    expect(album.stickers).toHaveLength(1)
    expect(album.backgrounds).toHaveLength(1)
  })

  it('rejects an invalid manifest', () => {
    expect(() => parseManifest({ album: {}, items: [] })).toThrow(
      'Dữ liệu album chưa đầy đủ.',
    )
  })
})
