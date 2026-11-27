import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildAlbumPath,
  clearAlbumManifestCache,
  clearMediaFileCache,
  detectMobilePlatform,
  fetchAlbum,
  getShareCodeFromPath,
  isMobileDevice,
  isSafeMediaUrl,
  normalizeMediaFileName,
  normalizeShareCode,
  parseManifest,
  prepareAllGalleryMediaFiles,
  saveAllMediaFilesToDevice,
  saveMediaFileToDevice,
} from '../src/lib/gallery'

afterEach(() => {
  clearAlbumManifestCache()
  clearMediaFileCache()
  vi.unstubAllEnvs()
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

  it('normalizes media filenames to English gallery-compatible extensions', () => {
    expect(normalizeMediaFileName('photobooth.webp', 'image/jpeg')).toBe('photobooth.jpg')
    expect(normalizeMediaFileName('khoanh-khac', 'image/jpeg')).toBe('photobooth.jpg')
    expect(normalizeMediaFileName('khoanh-khac.gif', 'image/gif')).toBe('photobooth.gif')
    expect(normalizeMediaFileName('anh-01.jpg', 'image/jpeg')).toBe('photo-01.jpg')
    expect(normalizeMediaFileName('  anh 01.png  ', 'image/png')).toBe('photo-01.png')
    expect(normalizeMediaFileName('', 'image/jpeg')).toBe('photo.jpg')
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

  it('shares all album files in one tap on mobile via navigator.share({ files })', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const canShare = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)',
      maxTouchPoints: 5,
      share,
      canShare,
    })

    const files = [
      new File([new Uint8Array([255, 216, 255])], 'strip.jpg', { type: 'image/jpeg' }),
      new File([new Uint8Array([255, 216, 255])], 'photo-01.jpg', { type: 'image/jpeg' }),
      new File([new Uint8Array([255, 216, 255])], 'photo-02.jpg', { type: 'image/jpeg' }),
    ]
    const outcome = await saveAllMediaFilesToDevice(files)

    expect(outcome.status).toBe('shared')
    expect(outcome.files).toHaveLength(3)
    expect(outcome.skippedCount).toBe(0)
    expect(canShare).toHaveBeenCalledWith({ files })
    expect(share).toHaveBeenCalledWith({ files })
  })

  it('returns ready-to-share on mobile when user activation expires after fetching all files', async () => {
    const notAllowed = Object.assign(new Error('User activation required'), { name: 'NotAllowedError' })
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)',
      maxTouchPoints: 5,
      share: vi.fn().mockRejectedValue(notAllowed),
      canShare: vi.fn().mockReturnValue(true),
    })

    const files = [
      new File([new Uint8Array([255, 216, 255])], 'strip.jpg', { type: 'image/jpeg' }),
      new File([new Uint8Array([255, 216, 255])], 'photo-01.jpg', { type: 'image/jpeg' }),
    ]
    const outcome = await saveAllMediaFilesToDevice(files)

    expect(outcome.status).toBe('ready-to-share')
    expect(outcome.files).toEqual(files)
    expect(outcome.skippedCount).toBe(0)
  })

  it('falls back to still images when mobile canShare rejects mixed image + GIF batches', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const canShare = vi.fn().mockImplementation(({ files }: { files: File[] }) =>
      files.every((file) => file.type !== 'image/gif'),
    )
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
      maxTouchPoints: 5,
      share,
      canShare,
    })

    const strip = new File([new Uint8Array([255, 216, 255])], 'strip.jpg', { type: 'image/jpeg' })
    const raw = new File([new Uint8Array([255, 216, 255])], 'photo-01.jpg', { type: 'image/jpeg' })
    const gif = new File([new Uint8Array([71, 73, 70])], 'boomerang.gif', { type: 'image/gif' })
    const outcome = await saveAllMediaFilesToDevice([strip, raw, gif])

    expect(outcome.status).toBe('shared')
    expect(outcome.files).toEqual([strip, raw])
    expect(outcome.skippedCount).toBe(1)
    expect(share).toHaveBeenCalledWith({ files: [strip, raw] })
  })

  it('returns manual fallback on mobile when multi-file share is unsupported', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
      maxTouchPoints: 5,
    })

    const files = [
      new File([new Uint8Array([255, 216, 255])], 'strip.jpg', { type: 'image/jpeg' }),
      new File([new Uint8Array([255, 216, 255])], 'photo-01.jpg', { type: 'image/jpeg' }),
    ]
    const outcome = await saveAllMediaFilesToDevice(files)

    expect(outcome.status).toBe('manual')
    expect(outcome.files).toEqual(files)
  })

  it('triggers staggered browser downloads for all files on desktop', async () => {
    const clickedDownloads: string[] = []
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      maxTouchPoints: 0,
    })
    vi.stubGlobal('window', {
      setTimeout: vi.fn(),
    })
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
      revokeObjectURL: vi.fn(),
    })
    vi.stubGlobal('document', {
      body: { appendChild: vi.fn() },
      createElement: vi.fn(() => {
        const anchor = {
          style: { display: '' },
          href: '',
          download: '',
          click: () => clickedDownloads.push(anchor.download),
          remove: vi.fn(),
        }
        return anchor
      }),
    })

    const files = [
      new File([new Uint8Array([255, 216, 255])], 'strip.jpg', { type: 'image/jpeg' }),
      new File([new Uint8Array([255, 216, 255])], 'photo-01.jpg', { type: 'image/jpeg' }),
    ]
    const outcome = await saveAllMediaFilesToDevice(files, { desktopDelayMs: 0 })

    expect(outcome.status).toBe('downloaded')
    expect(outcome.files).toEqual(files)
    expect(clickedDownloads).toEqual(['strip.jpg', 'photo-01.jpg'])
  })

  it('prepares all gallery items in order with progress reporting and unique filenames', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(new Uint8Array([255, 216, 255]), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const items = [
      {
        id: '1',
        kind: 'image' as const,
        url: 'https://example.com/1.jpg',
        thumbnailUrl: null,
        mimeType: 'image/jpeg',
        fileName: 'photo.jpg',
        width: 1200,
        height: 1800,
        durationMs: null,
        sortOrder: 0,
      },
      {
        id: '2',
        kind: 'image' as const,
        url: 'https://example.com/2.jpg',
        thumbnailUrl: null,
        mimeType: 'image/jpeg',
        fileName: 'photo.jpg',
        width: 1200,
        height: 1800,
        durationMs: null,
        sortOrder: 1,
      },
      {
        id: '3',
        kind: 'image' as const,
        url: 'https://example.com/3.jpg',
        thumbnailUrl: null,
        mimeType: 'image/jpeg',
        fileName: 'strip.jpg',
        width: 1200,
        height: 3600,
        durationMs: null,
        sortOrder: 2,
      },
    ]

    const progressEvents: Array<[number, number]> = []
    const files = await prepareAllGalleryMediaFiles(items, {
      concurrency: 2,
      onProgress: (done, total) => progressEvents.push([done, total]),
    })

    expect(files.map((f) => f.name)).toEqual(['photo.jpg', 'photo-02.jpg', 'strip.jpg'])
    expect(progressEvents[0]).toEqual([0, 3])
    expect(progressEvents[progressEvents.length - 1]).toEqual([3, 3])
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // Second call uses in-memory mediaFileCache (0 new fetches)
    await prepareAllGalleryMediaFiles(items)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('manifest caching and in-flight deduplication', () => {
  it('deduplicates concurrent fetchAlbum calls and serves subsequent reads from cache until bypassed', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
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
