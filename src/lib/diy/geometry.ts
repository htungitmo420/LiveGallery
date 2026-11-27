import type { DiyFilterId, DiyFrame, DiyLayout, DiyLayoutId, DiySlotRect } from './types'

export const DIY_FRAME_TARGET_PIXELS = 3_000_000

export const DIY_LAYOUTS: readonly DiyLayout[] = [
  { id: 'strip4', slots: 4, width: 900, height: 2400, kind: 'strip' },
  { id: 'strip3', slots: 3, width: 900, height: 2100, kind: 'strip' },
  { id: 'grid4', slots: 4, width: 1500, height: 1500, kind: 'grid' },
  { id: 'polaroid', slots: 1, width: 1200, height: 1500, kind: 'polaroid' },
]

export const DIY_FILTERS: readonly { id: DiyFilterId; css: string }[] = [
  { id: 'original', css: 'none' },
  { id: 'mono', css: 'grayscale(1) contrast(1.06)' },
  { id: 'warm', css: 'sepia(.18) saturate(1.12) brightness(1.03)' },
  { id: 'cool', css: 'saturate(.92) hue-rotate(12deg) brightness(1.02)' },
  { id: 'vintage', css: 'sepia(.32) saturate(.8) contrast(.94)' },
  { id: 'soft', css: 'brightness(1.08) contrast(.88) saturate(.92)' },
]

export const FALLBACK_DIY_FRAMES: readonly DiyFrame[] = [
  {
    id: 'paper',
    name: 'Classic White',
    description: 'Archival white print with crisp dark border',
    config: { background: '#ffffff', accent: '#171412', textColor: '#171412', radius: 20 },
    source: 'builtin',
  },
  {
    id: 'noir',
    name: '35mm Noir',
    description: 'Matte darkroom black with warm Kodak gold accent',
    config: { background: '#141311', accent: '#e5a93c', textColor: '#f3efe6', radius: 14 },
    source: 'builtin',
  },
  {
    id: 'cream',
    name: 'Archival Cream',
    description: 'Warm matte film paper with cocoa frame accent',
    config: { background: '#f6efe3', accent: '#6d4c3d', textColor: '#2d211b', radius: 18 },
    source: 'builtin',
  },
]

function even(value: number): number {
  const rounded = Math.max(2, Math.round(value))
  return rounded % 2 === 0 ? rounded : rounded + 1
}

export function getDiyLayoutById(id: DiyLayoutId): DiyLayout {
  return DIY_LAYOUTS.find((item) => item.id === id) ?? DIY_LAYOUTS[0]
}

export function getDiyFrameSize(layout: DiyLayout, frame: DiyFrame): { width: number; height: number } {
  const sourceWidth = frame.assetUrl && frame.assetWidth && frame.assetWidth > 0
    ? frame.assetWidth
    : layout.width
  const sourceHeight = frame.assetUrl && frame.assetHeight && frame.assetHeight > 0
    ? frame.assetHeight
    : layout.height
  const aspect = sourceWidth / sourceHeight
  const width = even(Math.sqrt(DIY_FRAME_TARGET_PIXELS * aspect))
  const height = even(width / aspect)
  return { width, height }
}

export function getDiyLayoutSlots(layout: DiyLayout, width: number, height: number): DiySlotRect[] {
  const pad = width * 0.065
  const footer = layout.kind === 'grid' ? height * 0.16 : height * 0.12

  if (layout.kind === 'polaroid') {
    const polaroidPad = width * 0.075
    const photoSize = width - polaroidPad * 2
    return [{
      x: polaroidPad,
      y: polaroidPad,
      width: photoSize,
      height: photoSize,
    }]
  }

  if (layout.kind === 'grid') {
    const gap = width * 0.035
    const cellWidth = (width - pad * 2 - gap) / 2
    const cellHeight = (height - pad * 2 - footer - gap) / 2
    return [
      { x: pad, y: pad, width: cellWidth, height: cellHeight },
      { x: pad + cellWidth + gap, y: pad, width: cellWidth, height: cellHeight },
      { x: pad, y: pad + cellHeight + gap, width: cellWidth, height: cellHeight },
      { x: pad + cellWidth + gap, y: pad + cellHeight + gap, width: cellWidth, height: cellHeight },
    ]
  }

  const gap = width * 0.045
  const slotHeight = (height - pad * 2 - footer - gap * (layout.slots - 1)) / layout.slots
  return Array.from({ length: layout.slots }, (_, index) => ({
    x: pad,
    y: pad + index * (slotHeight + gap),
    width: width - pad * 2,
    height: slotHeight,
  }))
}

interface ConnectedSlotComponent extends DiySlotRect {
  area: number
  touchesEdge: boolean
}

export function detectTransparentSlots(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  expectedSlots: number,
): DiySlotRect[] {
  const visited = new Uint8Array(width * height)
  const components: ConnectedSlotComponent[] = []
  const isTransparent = (index: number) => pixels[index * 4 + 3] <= 48

  for (let start = 0; start < visited.length; start += 1) {
    if (visited[start] || !isTransparent(start)) continue
    const stack = [start]
    visited[start] = 1
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    let area = 0
    let touchesEdge = false

    while (stack.length > 0) {
      const index = stack.pop()!
      const x = index % width
      const y = Math.floor(index / width)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      area += 1
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true

      const neighbours = [index - 1, index + 1, index - width, index + width]
      for (const neighbour of neighbours) {
        if (neighbour < 0 || neighbour >= visited.length || visited[neighbour]) continue
        const neighbourX = neighbour % width
        if (Math.abs(neighbourX - x) > 1 || !isTransparent(neighbour)) continue
        visited[neighbour] = 1
        stack.push(neighbour)
      }
    }

    components.push({
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      area,
      touchesEdge,
    })
  }

  const candidates = components
    .filter((item) => !item.touchesEdge)
    .filter((item) => item.area >= width * height * 0.015)
    .filter((item) => item.width >= width * 0.16 && item.height >= height * 0.07)
    .sort((a, b) => b.area - a.area)
    .slice(0, expectedSlots)

  if (candidates.length !== expectedSlots) return []
  return candidates
    .sort((a, b) => {
      const rowTolerance = Math.min(a.height, b.height) * 0.35
      return Math.abs(a.y - b.y) <= rowTolerance ? a.x - b.x : a.y - b.y
    })
    .map(({ x, y, width: slotWidth, height: slotHeight }) => ({
      x,
      y,
      width: slotWidth,
      height: slotHeight,
    }))
}

export function slotsMatchLayout(slots: DiySlotRect[], layout: DiyLayout): boolean {
  if (slots.length !== layout.slots) return false
  const centerY = (slot: DiySlotRect) => slot.y + slot.height / 2
  const sameRow = (a: DiySlotRect, b: DiySlotRect) =>
    Math.abs(centerY(a) - centerY(b)) < Math.min(a.height, b.height) * 0.35
  if (layout.kind === 'strip') {
    return slots.every((slot, index) => index === 0 || !sameRow(slots[index - 1], slot))
  }
  if (layout.kind === 'polaroid') return slots.length === 1
  return sameRow(slots[0], slots[1]) && sameRow(slots[2], slots[3]) && !sameRow(slots[1], slots[2])
}

export function filterFramesForLayout(frames: readonly DiyFrame[], layoutId: DiyLayoutId): DiyFrame[] {
  const matching = frames.filter((frame) => !frame.layoutId || frame.layoutId === layoutId)
  return matching.length > 0 ? matching : [...FALLBACK_DIY_FRAMES]
}
