import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildAlbumPath,
  clearAlbumManifestCache,
  detectMobilePlatform,
  fetchAlbum,
  getShareCodeFromPath,
  isMobileDevice,
  isSafeMediaUrl,
  normalizeMediaFileName,
  normalizeShareCode,
  parseManifest,
  saveMediaFileToDevice,
} from './gallery'

afterEach(() => {
  clearAlbumManifestCache()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

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

  it('validates media URLs and blocks unsafe schemes in manifest items and decor', () => {
    expect(isSafeMediaUrl('https://abc.r2.cloudflarestorage.com/bucket/photo.jpg')).toBe(true)
    expect(isSafeMediaUrl('http://localhost:4173/mock.png')).toBe(true)
    expect(isSafeMediaUrl('http://127.0.0.1:54321/mock.jpg')).toBe(true)
    expect(isSafeMediaUrl('blob:https://livegallery.vercel.app/1234-5678')).toBe(true)
    expect(isSafeMediaUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
    expect(isSafeMediaUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(true)
    expect(isSafeMediaUrl('data:image/webp;base64,UklGRg==')).toBe(true)
    expect(isSafeMediaUrl('data:image/gif;base64,R0lGODlh')).toBe(true)

    expect(isSafeMediaUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeMediaUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeMediaUrl('data:image/svg+xml,<svg onload=alert(1)>')).toBe(false)
    expect(isSafeMediaUrl('http://insecure.example.com/photo.jpg')).toBe(false)
    expect(isSafeMediaUrl('https://user:pass@example.com/photo.jpg')).toBe(false)
    expect(isSafeMediaUrl('file:///etc/passwd')).toBe(false)

    expect(() => parseManifest({
      album: { shareCode: 'safe01', title: 'Test', createdAt: '2026-10-20T12:00:00.000Z' },
      items: [{ id: '1', kind: 'image', url: 'javascript:alert(1)', fileName: 'x.jpg' }],
    })).toThrow('Dữ liệu ảnh không hợp lệ.')

    expect(() => parseManifest({
      album: { shareCode: 'safe02', title: 'Test', createdAt: '2026-10-20T12:00:00.000Z' },
      items: [{ id: '1', kind: 'image', url: 'data:image/svg+xml,<svg/>', fileName: 'x.svg' }],
    })).toThrow('Dữ liệu ảnh không hợp lệ.')

    const album = parseManifest({
      album: { shareCode: 'safe03', title: 'Safe Album', createdAt: '2026-10-20T12:00:00.000Z' },
      items: [
        {
          id: 'img-1',
          kind: 'image',
          url: 'https://example.r2.cloudflarestorage.com/b/1.jpg',
          thumbnailUrl: 'javascript:alert(1)',
          mimeType: 'image/jpeg',
          fileName: 'photobooth.jpg',
          sortOrder: 0,
        },
      ],
      decor: {
        stickers: [
          { id: 'ok', name: 'Tim', category: 'cute', url: 'https://proj.supabase.co/storage/v1/s.png' },
          { id: 'xss', name: 'Bad', category: 'cute', url: 'data:image/svg+xml,<svg/>' },
          { id: 'http', name: 'Insecure', category: 'cute', url: 'http://evil.example.com/s.png' },
        ],
        backgrounds: [
          { id: 'ok-bg', name: 'Paper', url: 'https://proj.supabase.co/storage/v1/bg.jpg' },
          { id: 'bad-bg', name: 'XSS', url: 'javascript:alert(1)' },
        ],
      },
    })
    expect(album.items[0].thumbnailUrl).toBeNull()
    expect(album.stickers).toHaveLength(1)
    expect(album.stickers[0].id).toBe('ok')
    expect(album.backgrounds).toHaveLength(1)
    expect(album.backgrounds[0].id).toBe('ok-bg')
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

describe('manifest caching and in-flight deduplication', () => {
  it('deduplicates concurrent fetchAlbum calls and serves subsequent reads from cache until bypassed', async () => {
    const manifestPayload = {
      album: {
        shareCode: 'fast999',
        title: 'Tối ưu tốc độ',
        message: null,
        createdAt: '2026-11-26T12:00:00.000Z',
        expiresAt: null,
      },
      items: [
        {
          id: 'img-1',
          kind: 'image',
          url: 'https://example.r2.cloudflarestorage.com/live-gallery/a/b.jpg',
          thumbnailUrl: null,
          mimeType: 'image/jpeg',
          fileName: 'photobooth.jpg',
          sortOrder: 0,
        },
      ],
      decor: { stickers: [], backgrounds: [] },
    }

    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(manifestPayload), { status: 200 })),
    )
    vi.stubGlobal('fetch', fetchMock)

    const [a, b] = await Promise.all([fetchAlbum('fast999'), fetchAlbum('FAST999')])
    expect(a.shareCode).toBe('fast999')
    expect(b.shareCode).toBe('fast999')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Subsequent call hits in-memory cache (0 additional network requests)
    const c = await fetchAlbum('fast999')
    expect(c.title).toBe('Tối ưu tốc độ')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Explicit refresh bypasses cache
    await fetchAlbum('fast999', undefined, { bypassCache: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
