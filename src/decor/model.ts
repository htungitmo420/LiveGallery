export type DecorMode = 'stickers' | 'background'
export type CollageFormat = 'landscape' | 'square' | 'portrait' | 'story'
export type CollagePattern = 'solid' | 'dots' | 'grid'
export type CollageMessagePosition = 'top' | 'bottom'
export type StickerCategory = 'cute' | 'nature' | 'lucky' | 'retro'

export interface DecorStickerAsset {
  id: string
  name: string
  category?: string
  kind: 'emoji' | 'image'
  content: string
}

export interface PlacedSticker extends DecorStickerAsset {
  placementId: string
  x: number
  y: number
  size: number
  rotation: number
  flipX?: boolean
  zIndex: number
}

export interface CollageItem {
  id: string
  x: number
  y: number
  width: number
  rotation: number
  zIndex: number
}

export interface CollageSettings {
  format: CollageFormat
  background: string
  backgroundImageUrl?: string
  pattern: CollagePattern
  message: string
  messageColor: string
  messagePosition?: CollageMessagePosition
  items: CollageItem[]
}

export const MAX_STICKERS = 20
export const MAX_COLLAGE_ITEMS = 6
export const COLLAGE_COLORS = ['#5a3822', '#171717', '#f4e7d3', '#d98282', '#6c7c63', '#596b8d', '#f7f2ea']

export function clampStickerCoord(value: number): number {
  return Math.min(1.1, Math.max(-0.1, value))
}

export function clampStickerSize(value: number): number {
  return Math.min(0.4, Math.max(0.05, Number(value.toFixed(3))))
}

export function normalizeStickerRotation(degrees: number): number {
  const rounded = Math.round(degrees)
  if (rounded === 180) return 180
  const wrapped = ((((rounded + 180) % 360) + 360) % 360) - 180
  return Object.is(wrapped, -0) ? 0 : wrapped
}

export function movePlacedSticker(
  sticker: Pick<PlacedSticker, 'x' | 'y'>,
  deltaX: number,
  deltaY: number,
): Pick<PlacedSticker, 'x' | 'y'> {
  return {
    x: clampStickerCoord(sticker.x + deltaX),
    y: clampStickerCoord(sticker.y + deltaY),
  }
}

export function transformStickerByGesture(
  initial: Pick<PlacedSticker, 'size' | 'rotation'>,
  initialDistance: number,
  currentDistance: number,
  initialAngleRad: number,
  currentAngleRad: number,
): Pick<PlacedSticker, 'size' | 'rotation'> {
  const safeInitialDistance = Math.max(1, initialDistance)
  const scale = Math.max(0.1, currentDistance) / safeInitialDistance
  const angleDeltaDeg = ((currentAngleRad - initialAngleRad) * 180) / Math.PI
  return {
    size: clampStickerSize(initial.size * scale),
    rotation: normalizeStickerRotation(initial.rotation + angleDeltaDeg),
  }
}

export function getStickerToolbarPosition(sticker: Pick<PlacedSticker, 'x' | 'y' | 'size'>): {
  left: number
  top: number
  placement: 'above' | 'below'
} {
  const left = Math.min(0.7, Math.max(0.3, sticker.x))
  const aboveTop = sticker.y - sticker.size / 2 - 0.055
  if (aboveTop < 0.03) {
    return {
      left,
      top: Math.min(0.94, Math.max(0.05, sticker.y + sticker.size / 2 + 0.06)),
      placement: 'below',
    }
  }
  return {
    left,
    top: Math.min(0.94, Math.max(0.04, aboveTop)),
    placement: 'above',
  }
}

export function duplicatePlacedSticker(source: PlacedSticker, placementId: string, zIndex: number): PlacedSticker {
  return {
    ...source,
    placementId,
    x: clampStickerCoord(source.x + 0.04),
    y: clampStickerCoord(source.y + 0.04),
    zIndex,
  }
}

export const COLLAGE_FORMATS: Array<{ id: CollageFormat; label: string; width: number; height: number }> = [
  { id: 'landscape', label: '16:9', width: 1920, height: 1080 },
  { id: 'square', label: '1:1', width: 1440, height: 1440 },
  { id: 'portrait', label: '4:5', width: 1440, height: 1800 },
  { id: 'story', label: '9:16', width: 1440, height: 2560 },
]

export const STICKER_CATEGORIES: Array<{ id: 'all' | StickerCategory; name: string }> = [
  { id: 'all', name: 'Tất cả' },
  { id: 'cute', name: 'Dễ thương' },
  { id: 'nature', name: 'Thiên nhiên' },
  { id: 'lucky', name: 'May mắn' },
  { id: 'retro', name: 'Retro' },
]

const STICKER_GROUPS: Record<StickerCategory, Array<[string, string, string]>> = {
  cute: [
    ['rabbit', 'Thỏ', '🐰'], ['bear', 'Gấu', '🧸'], ['bow', 'Nơ', '🎀'], ['heart', 'Trái tim', '💗'],
    ['chick', 'Gà con', '🐥'], ['cat', 'Mèo', '🐱'], ['flower-face', 'Hoa đào', '🌸'], ['sparkle-heart', 'Tim lấp lánh', '💖'],
  ],
  nature: [
    ['clover', 'Cỏ may mắn', '🍀'], ['flower', 'Hoa cúc', '🌼'], ['cherry', 'Anh đào', '🍒'], ['leaf', 'Lá cây', '🌿'],
    ['sun', 'Mặt trời', '☀️'], ['rainbow', 'Cầu vồng', '🌈'], ['cloud', 'Mây', '☁️'], ['butterfly', 'Bướm', '🦋'],
  ],
  lucky: [
    ['mushroom', 'Nấm', '🍄'], ['dice', 'Xúc xắc', '🎲'], ['horseshoe', 'Nam châm', '🧲'], ['crystal', 'Kim cương', '💎'],
    ['key', 'Chìa khóa', '🗝️'], ['eight-ball', 'Bi số 8', '🎱'], ['red-envelope', 'Lì xì', '🧧'], ['fortune', 'Bánh may mắn', '🥠'],
  ],
  retro: [
    ['camera', 'Máy ảnh', '📷'], ['cassette', 'Băng cassette', '📼'], ['disc', 'Đĩa CD', '💿'], ['game', 'Tay cầm game', '🎮'],
    ['phone', 'Điện thoại cổ', '☎️'], ['glasses', 'Kính mát', '🕶️'], ['roller', 'Giày patin', '🛼'], ['lightning', 'Tia chớp', '⚡'],
  ],
}

export const FALLBACK_STICKERS: DecorStickerAsset[] = (
  Object.entries(STICKER_GROUPS) as Array<[StickerCategory, Array<[string, string, string]>]>
).flatMap(([category, items]) =>
  items.map(([id, name, content]) => ({
    id: `emoji-${category}-${id}`,
    name,
    category,
    content,
    kind: 'emoji' as const,
  })),
)

export const DEFAULT_COLLAGE: CollageSettings = {
  format: 'story',
  background: '#5a3822',
  pattern: 'solid',
  message: '',
  messageColor: '#ffffff',
  messagePosition: 'bottom',
  items: [{ id: 'strip-main', x: 0.5, y: 0.5, width: 0.42, rotation: 0, zIndex: 1 }],
}

export function collageSize(format: CollageFormat) {
  return COLLAGE_FORMATS.find((item) => item.id === format) ?? COLLAGE_FORMATS[3]
}
