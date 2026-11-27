import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COLLAGE,
  FALLBACK_STICKERS,
  STICKER_CATEGORIES,
  duplicatePlacedSticker,
  getStickerToolbarPosition,
  movePlacedSticker,
  normalizeStickerRotation,
  transformStickerByGesture,
  type PlacedSticker,
} from '../src/decor'

const sticker: PlacedSticker = {
  id: 'rabbit',
  placementId: 'sticker-original',
  name: 'Thỏ',
  kind: 'emoji',
  content: '🐰',
  x: .45,
  y: .35,
  size: .14,
  rotation: 18,
  zIndex: 2,
}

describe('sticker duplication', () => {
  it('keeps the decoration while assigning a new placement and layer', () => {
    const duplicate = duplicatePlacedSticker(sticker, 'sticker-copy', 7)
    expect(duplicate).toMatchObject({
      id: sticker.id,
      placementId: 'sticker-copy',
      name: sticker.name,
      kind: sticker.kind,
      content: sticker.content,
      size: sticker.size,
      rotation: sticker.rotation,
      zIndex: 7,
    })
    expect(duplicate.x).toBeCloseTo(.49)
    expect(duplicate.y).toBeCloseTo(.39)
  })

  it('keeps an offset copy inside the editable overflow boundary', () => {
    expect(duplicatePlacedSticker({ ...sticker, x: 1.09, y: 1.09 }, 'copy', 3)).toMatchObject({
      x: 1.1,
      y: 1.1,
    })
  })
})

describe('mobile sticker interactions', () => {
  it('moves stickers relatively by pointer delta and clamps to stage bounds', () => {
    expect(movePlacedSticker({ x: .5, y: .5 }, .15, -.2)).toEqual({
      x: .65,
      y: .3,
    })
    expect(movePlacedSticker({ x: .02, y: .98 }, -.3, .3)).toEqual({
      x: -.1,
      y: 1.1,
    })
  })

  it('normalizes rotation angles into the [-180, 180] slider range', () => {
    expect(normalizeStickerRotation(0)).toBe(0)
    expect(normalizeStickerRotation(180)).toBe(180)
    expect(normalizeStickerRotation(-180)).toBe(-180)
    expect(normalizeStickerRotation(195)).toBe(-165)
    expect(normalizeStickerRotation(-195)).toBe(165)
  })

  it('transforms size and rotation from two-finger pinch and twist gestures', () => {
    const result = transformStickerByGesture(
      { size: .15, rotation: 10 },
      100,
      150,
      0,
      Math.PI / 4,
    )
    expect(result.size).toBeCloseTo(.225)
    expect(result.rotation).toBe(55)
  })

  it('flips the floating toolbar below the sticker when near the top edge', () => {
    const nearTop = getStickerToolbarPosition({ x: .5, y: .08, size: .14 })
    expect(nearTop.placement).toBe('below')
    expect(nearTop.top).toBeGreaterThan(.08)

    const middle = getStickerToolbarPosition({ x: .5, y: .5, size: .14 })
    expect(middle.placement).toBe('above')
    expect(middle.top).toBeLessThan(.5)
  })

  it('aligns fallback stickers, categories, flipX, and collage defaults with Photobooth', () => {
    expect(STICKER_CATEGORIES.map((item) => item.id)).toEqual(['all', 'cute', 'nature', 'lucky', 'retro'])
    expect(FALLBACK_STICKERS).toHaveLength(32)
    expect(new Set(FALLBACK_STICKERS.map((item) => item.category))).toEqual(
      new Set(['cute', 'nature', 'lucky', 'retro']),
    )
    expect(DEFAULT_COLLAGE.messagePosition).toBe('bottom')

    const flipped = duplicatePlacedSticker({ ...sticker, flipX: true }, 'copy-flipped', 5)
    expect(flipped.flipX).toBe(true)
  })
})
