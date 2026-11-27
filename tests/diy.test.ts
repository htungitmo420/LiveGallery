import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearDiyCatalogCache,
  fetchDiyCatalog,
  parseDiyCatalogPayload,
} from '../src/lib/diy/catalog'
import {
  DIY_FRAME_TARGET_PIXELS,
  FALLBACK_DIY_FRAMES,
  detectTransparentSlots,
  filterFramesForLayout,
  getDiyFrameSize,
  getDiyLayoutById,
  getDiyLayoutSlots,
  slotsMatchLayout,
} from '../src/lib/diy/geometry'

function makeFrameBitmap(
  width: number,
  height: number,
  cutouts: Array<{ x: number; y: number; w: number; h: number }>,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4)
  // Fill opaque white
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 255
    pixels[i + 1] = 255
    pixels[i + 2] = 255
    pixels[i + 3] = 255
  }
  // Carve transparent slots
  for (const box of cutouts) {
    for (let y = box.y; y < box.y + box.h; y += 1) {
      for (let x = box.x; x < box.x + box.w; x += 1) {
        pixels[(y * width + x) * 4 + 3] = 0
      }
    }
  }
  return pixels
}

afterEach(() => {
  clearDiyCatalogCache()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('DIY photobooth geometry & cutout detection', () => {
  it('computes even 3MP canvas dimensions preserving frame asset aspect ratio', () => {
    const layout = getDiyLayoutById('strip4')
    const remoteFrame = {
      id: 'kodak-strip4',
      name: 'KODAK PORTRA',
      description: '',
      config: { background: '#fff', accent: '#000', textColor: '#000', radius: 0 },
      assetUrl: 'https://proj.supabase.co/storage/v1/object/public/photobooth-frames/KODAK_PORTRA_4x1.png',
      layoutId: 'strip4' as const,
      assetWidth: 730,
      assetHeight: 3342,
      source: 'remote' as const,
    }

    const size = getDiyFrameSize(layout, remoteFrame)
    expect(size.width % 2).toBe(0)
    expect(size.height % 2).toBe(0)
    expect(size.width * size.height).toBeGreaterThan(DIY_FRAME_TARGET_PIXELS * 0.95)
    expect(size.width * size.height).toBeLessThan(DIY_FRAME_TARGET_PIXELS * 1.05)
    expect(size.width / size.height).toBeCloseTo(730 / 3342, 2)
  })

  it('computes non-overlapping fallback slots for strip4, strip3, grid4, and polaroid', () => {
    for (const id of ['strip4', 'strip3', 'grid4', 'polaroid'] as const) {
      const layout = getDiyLayoutById(id)
      const slots = getDiyLayoutSlots(layout, layout.width, layout.height)
      expect(slots).toHaveLength(layout.slots)
      expect(slotsMatchLayout(slots, layout)).toBe(true)
      for (const slot of slots) {
        expect(slot.x).toBeGreaterThan(0)
        expect(slot.y).toBeGreaterThan(0)
        expect(slot.width).toBeGreaterThan(0)
        expect(slot.height).toBeGreaterThan(0)
      }
    }
  })

  it('detects transparent photo slots inside PNG frames and validates layout matching', () => {
    const stripPixels = makeFrameBitmap(100, 260, [
      { x: 12, y: 12, w: 76, h: 48 },
      { x: 12, y: 70, w: 76, h: 48 },
      { x: 12, y: 128, w: 76, h: 48 },
      { x: 12, y: 186, w: 76, h: 48 },
    ])
    const stripSlots = detectTransparentSlots(stripPixels, 100, 260, 4)
    expect(stripSlots).toHaveLength(4)
    expect(stripSlots[0].y).toBe(12)
    expect(stripSlots[3].y).toBe(186)
    expect(slotsMatchLayout(stripSlots, getDiyLayoutById('strip4'))).toBe(true)
    expect(slotsMatchLayout(stripSlots, getDiyLayoutById('grid4'))).toBe(false)

    const gridPixels = makeFrameBitmap(120, 120, [
      { x: 10, y: 10, w: 44, h: 40 },
      { x: 66, y: 10, w: 44, h: 40 },
      { x: 10, y: 60, w: 44, h: 40 },
      { x: 66, y: 60, w: 44, h: 40 },
    ])
    const gridSlots = detectTransparentSlots(gridPixels, 120, 120, 4)
    expect(gridSlots).toHaveLength(4)
    expect(slotsMatchLayout(gridSlots, getDiyLayoutById('grid4'))).toBe(true)
    expect(slotsMatchLayout(gridSlots, getDiyLayoutById('strip4'))).toBe(false)
  })

  it('filters frames by layoutId while preserving universal built-in frames', () => {
    const catalog = parseDiyCatalogPayload({
      frames: [
        {
          id: 'film-strip4',
          name: 'Film · 4',
          assetUrl: 'https://proj.supabase.co/storage/v1/object/public/photobooth-frames/film_4x1.png',
          layoutId: 'strip4',
          assetWidth: 793,
          assetHeight: 1983,
          config: { background: '#ffffff', accent: '#111111', textColor: '#111111', radius: 0 },
        },
        {
          id: 'film-strip3',
          name: 'Film · 3',
          assetUrl: 'https://proj.supabase.co/storage/v1/object/public/photobooth-frames/film_3x1.png',
          layoutId: 'strip3',
          assetWidth: 793,
          assetHeight: 1983,
          config: { background: '#ffffff', accent: '#111111', textColor: '#111111', radius: 0 },
        },
      ],
      decor: { stickers: [], backgrounds: [] },
    })

    const strip4Frames = filterFramesForLayout(catalog.frames, 'strip4')
    expect(strip4Frames.some((f) => f.id === 'film-strip4')).toBe(true)
    expect(strip4Frames.some((f) => f.id === 'film-strip3')).toBe(false)
    expect(strip4Frames.some((f) => f.id === 'paper')).toBe(true)
  })
})

describe('DIY catalog loading and sanitization', () => {
  it('blocks unsafe URLs in remote frames, stickers, and backgrounds', () => {
    const catalog = parseDiyCatalogPayload({
      frames: [
        {
          id: 'safe-frame',
          name: 'Safe Frame',
          assetUrl: 'https://proj.supabase.co/storage/v1/object/public/photobooth-frames/white_4x1.png',
          layoutId: 'strip4',
          assetWidth: 941,
          assetHeight: 1672,
          config: {},
        },
        {
          id: 'xss-frame',
          name: 'Bad Frame',
          assetUrl: 'javascript:alert(1)',
          layoutId: 'strip4',
        },
      ],
      decor: {
        stickers: [
          { id: 'ok', name: 'Heart', category: 'cute', url: 'https://proj.supabase.co/storage/v1/s.png' },
          { id: 'bad', name: 'SVG', category: 'cute', url: 'data:image/svg+xml,<svg/>' },
        ],
        backgrounds: [
          { id: 'bg-ok', name: 'Paper', url: 'https://proj.supabase.co/storage/v1/bg.jpg' },
          { id: 'bg-bad', name: 'Insecure', url: 'http://evil.example/bg.jpg' },
        ],
      },
    })

    expect(catalog.remote).toBe(true)
    expect(catalog.frames.some((f) => f.id === 'safe-frame')).toBe(true)
    expect(catalog.frames.some((f) => f.id === 'xss-frame')).toBe(false)
    expect(catalog.stickers).toHaveLength(1)
    expect(catalog.backgrounds).toHaveLength(1)
  })

  it('fetches catalog from album-manifest?catalog=1 with caching and deduplication', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            frames: [
              {
                id: 'kodak-strip4',
                name: 'KODAK PORTRA · 4',
                assetUrl: 'https://example.supabase.co/storage/v1/object/public/photobooth-frames/KODAK_PORTRA_4x1.png',
                layoutId: 'strip4',
                assetWidth: 730,
                assetHeight: 3342,
                config: { background: '#fff8e9', accent: '#dc8b2e', textColor: '#3c2818', radius: 0 },
              },
            ],
            decor: {
              stickers: [{ id: 'st-1', name: 'Star', category: 'cute', url: 'https://example.supabase.co/storage/v1/object/public/photobooth-stickers/star.png' }],
              backgrounds: [],
            },
          }),
          { status: 200 },
        ),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const [a, b] = await Promise.all([fetchDiyCatalog(), fetchDiyCatalog()])
    expect(a.remote).toBe(true)
    expect(b.frames[0].id).toBe('kodak-strip4')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.supabase.co/functions/v1/album-manifest?catalog=1')

    // Subsequent call uses memory cache
    await fetchDiyCatalog()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back gracefully to built-in frames when no backend is configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_GALLERY_API_URL', '')

    const catalog = await fetchDiyCatalog()
    expect(catalog.remote).toBe(false)
    expect(catalog.frames).toEqual([...FALLBACK_DIY_FRAMES])
    expect(catalog.stickers).toEqual([])
    expect(catalog.backgrounds).toEqual([])
  })
})
