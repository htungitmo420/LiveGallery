import { describe, expect, it } from 'vitest'
import { duplicatePlacedSticker, type PlacedSticker } from './decor'

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
