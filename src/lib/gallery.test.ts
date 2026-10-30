import { describe, expect, it, vi } from 'vitest'
import {
  buildAlbumPath,
  detectMobilePlatform,
  getShareCodeFromPath,
  isMobileDevice,
  normalizeMediaFileName,
  normalizeShareCode,
  parseManifest,
  saveMediaFileToDevice,
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

describe('mobile photo export helpers', () => {
  it('detects iOS, iPadOS, Android, and desktop platforms accurately', () => {
    expect(detectMobilePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)', 5)).toBe('ios')
    expect(detectMobilePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios')
    expect(detectMobilePlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5)).toBe('android')
    expect(detectMobilePlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0)).toBe('desktop')
    expect(isMobileDevice('Mozilla/5.0 (Linux; Android 14; SM-S928B)', 5)).toBe(true)
    expect(isMobileDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0)).toBe(false)
  })

  it('normalizes media filenames to gallery-compatible extensions', () => {
    expect(normalizeMediaFileName('photobooth.webp', 'image/jpeg')).toBe('photobooth.jpg')
    expect(normalizeMediaFileName('khoanh-khac', 'image/jpeg')).toBe('khoanh-khac.jpg')
    expect(normalizeMediaFileName('khoanh-khac.gif', 'image/gif')).toBe('khoanh-khac.gif')
    expect(normalizeMediaFileName('  anh 01.png  ', 'image/png')).toBe('anh-01.png')
  })

  it('shares files directly on mobile without text fields so iOS and Android show Save to Photos', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const canShare = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)',
      maxTouchPoints: 5,
      share,
      canShare,
    })

    const file = new File([new Uint8Array([255, 216, 255])], 'photobooth.jpg', { type: 'image/jpeg' })
    const outcome = await saveMediaFileToDevice(file)

    expect(outcome.status).toBe('shared')
    expect(canShare).toHaveBeenCalledWith({ files: [file] })
    expect(share).toHaveBeenCalledWith({ files: [file] })
    vi.unstubAllGlobals()
  })

  it('returns manual photo-save fallback on mobile when Web Share activation expires instead of downloading to Files', async () => {
    const notAllowed = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
      maxTouchPoints: 5,
      share: vi.fn().mockRejectedValue(notAllowed),
      canShare: vi.fn().mockReturnValue(true),
    })

    const file = new File([new Uint8Array([255, 216, 255])], 'photobooth.jpg', { type: 'image/jpeg' })
    const outcome = await saveMediaFileToDevice(file)

    expect(outcome.status).toBe('manual')
    expect(outcome.canRetryShare).toBe(true)
    expect(outcome.previewUrl).toMatch(/^data:image\/jpeg;base64,/)
    vi.unstubAllGlobals()
  })
})
