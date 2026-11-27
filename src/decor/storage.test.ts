import { describe, expect, it } from 'vitest'
import { DEFAULT_COLLAGE, MAX_COLLAGE_ITEMS, MAX_STICKERS } from './model'
import { sanitizeStoredCollage, sanitizeStoredStickers } from './storage'

describe('decor storage sanitization', () => {
  it('filters malformed or unsafe stickers, clamps bounds, and caps at MAX_STICKERS', () => {
    const oversizedList = Array.from({ length: MAX_STICKERS + 5 }, (_, index) => ({
      id: `emoji-${index}`,
      placementId: `p-${index}`,
      name: `Sticker ${index}`,
      kind: 'emoji',
      content: '🐰',
      x: 0.5,
      y: 0.5,
      size: 0.9,
      rotation: 200,
      flipX: index % 2 === 0,
      zIndex: index + 1.8,
    }))

    const sanitized = sanitizeStoredStickers([
      {
        id: 'bad-xss',
        placementId: 'p-xss',
        name: 'XSS',
        kind: 'image',
        content: 'javascript:alert(1)',
        x: 0.5,
        y: 0.5,
        size: 0.14,
        rotation: 0,
        zIndex: 1,
      },
      {
        id: 'bad-svg',
        placementId: 'p-svg',
        name: 'SVG',
        kind: 'image',
        content: 'data:image/svg+xml,<svg/>',
        x: 0.5,
        y: 0.5,
        size: 0.14,
        rotation: 0,
        zIndex: 1,
      },
      ...oversizedList,
    ])

    expect(sanitized).toHaveLength(MAX_STICKERS)
    expect(sanitized[0]).toMatchObject({
      id: 'emoji-0',
      size: 0.4,
      rotation: -160,
      flipX: true,
      zIndex: 1,
    })
  })

  it('sanitizes collage settings, strips blob backgrounds, and caps item count', () => {
    const rawItems = Array.from({ length: MAX_COLLAGE_ITEMS + 3 }, (_, index) => ({
      id: `strip-${index}`,
      x: 5,
      y: -5,
      width: 2,
      rotation: -195,
      zIndex: index + 1,
    }))

    const sanitized = sanitizeStoredCollage({
      format: 'square',
      pattern: 'grid',
      messagePosition: 'top',
      background: '#123456',
      messageColor: 'not-a-color',
      message: 'x'.repeat(100),
      backgroundImageUrl: 'blob:https://photobooth-itmo.vercel.app/temp-bg',
      items: rawItems,
    })

    expect(sanitized.format).toBe('square')
    expect(sanitized.pattern).toBe('grid')
    expect(sanitized.messagePosition).toBe('top')
    expect(sanitized.background).toBe('#123456')
    expect(sanitized.messageColor).toBe(DEFAULT_COLLAGE.messageColor)
    expect(sanitized.message).toHaveLength(80)
    expect(sanitized.backgroundImageUrl).toBeUndefined()
    expect(sanitized.items).toHaveLength(MAX_COLLAGE_ITEMS)
    expect(sanitized.items[0]).toMatchObject({
      x: 1.12,
      y: -0.12,
      width: 0.95,
      rotation: 165,
    })
  })

  it('falls back to DEFAULT_COLLAGE for invalid input', () => {
    expect(sanitizeStoredCollage(null)).toEqual(DEFAULT_COLLAGE)
    expect(sanitizeStoredCollage({ items: [] }).items).toEqual(DEFAULT_COLLAGE.items)
  })
})
