import { isSafeMediaUrl } from '../lib/gallery'
import {
  DEFAULT_COLLAGE,
  MAX_COLLAGE_ITEMS,
  MAX_STICKERS,
  clampStickerSize,
  normalizeStickerRotation,
  type CollageItem,
  type CollageSettings,
  type PlacedSticker,
} from './model'

export interface StoredDecor {
  stickers: PlacedSticker[]
  collage: CollageSettings
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i

export function sanitizeStoredStickers(raw: unknown): PlacedSticker[] {
  if (!Array.isArray(raw)) return []
  const valid: PlacedSticker[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const id = typeof item.id === 'string' ? item.id : ''
    const placementId = typeof item.placementId === 'string' ? item.placementId : ''
    const name = typeof item.name === 'string' ? item.name : ''
    const kind = item.kind
    const content = typeof item.content === 'string' ? item.content.trim() : ''
    if (!id || !placementId || !name || !content) continue
    if (kind !== 'emoji' && kind !== 'image') continue
    if (kind === 'image' && !isSafeMediaUrl(content)) continue
    if (
      typeof item.x !== 'number' || !Number.isFinite(item.x)
      || typeof item.y !== 'number' || !Number.isFinite(item.y)
      || typeof item.size !== 'number' || !Number.isFinite(item.size)
      || typeof item.rotation !== 'number' || !Number.isFinite(item.rotation)
      || typeof item.zIndex !== 'number' || !Number.isFinite(item.zIndex)
    ) {
      continue
    }
    valid.push({
      id,
      placementId,
      name,
      category: typeof item.category === 'string' ? item.category : undefined,
      kind,
      content,
      x: item.x,
      y: item.y,
      size: clampStickerSize(item.size),
      rotation: normalizeStickerRotation(item.rotation),
      flipX: Boolean(item.flipX),
      zIndex: Math.trunc(item.zIndex),
    })
    if (valid.length >= MAX_STICKERS) break
  }
  return valid
}

export function sanitizeStoredCollage(raw: unknown): CollageSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_COLLAGE
  const record = raw as Record<string, unknown>
  const rawItems = Array.isArray(record.items) ? record.items : []
  const items: CollageItem[] = []
  for (const entry of rawItems) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    if (
      typeof item.id !== 'string' || !item.id
      || typeof item.x !== 'number' || !Number.isFinite(item.x)
      || typeof item.y !== 'number' || !Number.isFinite(item.y)
      || typeof item.width !== 'number' || !Number.isFinite(item.width)
      || typeof item.rotation !== 'number' || !Number.isFinite(item.rotation)
      || typeof item.zIndex !== 'number' || !Number.isFinite(item.zIndex)
    ) {
      continue
    }
    items.push({
      id: item.id,
      x: Math.min(1.12, Math.max(-0.12, item.x)),
      y: Math.min(1.12, Math.max(-0.12, item.y)),
      width: Math.min(0.95, Math.max(0.12, item.width)),
      rotation: normalizeStickerRotation(item.rotation),
      zIndex: Math.trunc(item.zIndex),
    })
    if (items.length >= MAX_COLLAGE_ITEMS) break
  }

  const format = record.format === 'landscape' || record.format === 'square' || record.format === 'portrait' || record.format === 'story'
    ? record.format
    : DEFAULT_COLLAGE.format
  const pattern = record.pattern === 'solid' || record.pattern === 'dots' || record.pattern === 'grid'
    ? record.pattern
    : DEFAULT_COLLAGE.pattern
  const messagePosition = record.messagePosition === 'top' || record.messagePosition === 'bottom'
    ? record.messagePosition
    : DEFAULT_COLLAGE.messagePosition
  const background = typeof record.background === 'string' && HEX_COLOR_PATTERN.test(record.background.trim())
    ? record.background.trim()
    : DEFAULT_COLLAGE.background
  const messageColor = typeof record.messageColor === 'string' && HEX_COLOR_PATTERN.test(record.messageColor.trim())
    ? record.messageColor.trim()
    : DEFAULT_COLLAGE.messageColor
  const message = typeof record.message === 'string' ? record.message.slice(0, 80) : DEFAULT_COLLAGE.message
  const backgroundImageUrl = typeof record.backgroundImageUrl === 'string'
    && isSafeMediaUrl(record.backgroundImageUrl)
    && !record.backgroundImageUrl.trim().toLowerCase().startsWith('blob:')
    ? record.backgroundImageUrl.trim()
    : undefined

  return {
    format,
    background,
    backgroundImageUrl,
    pattern,
    message,
    messageColor,
    messagePosition,
    items: items.length > 0 ? items : DEFAULT_COLLAGE.items,
  }
}

export function readStoredDecor(code: string): StoredDecor {
  try {
    const raw = localStorage.getItem(`livegallery-decor:${code}`)
    if (!raw) return { stickers: [], collage: DEFAULT_COLLAGE }
    const parsed = JSON.parse(raw) as Partial<StoredDecor>
    return {
      stickers: sanitizeStoredStickers(parsed.stickers),
      collage: sanitizeStoredCollage(parsed.collage),
    }
  } catch {
    return { stickers: [], collage: DEFAULT_COLLAGE }
  }
}

export function writeStoredDecor(code: string, stickers: PlacedSticker[], collage: CollageSettings): void {
  try {
    const safeCollage = collage.backgroundImageUrl?.startsWith('blob:')
      ? { ...collage, backgroundImageUrl: undefined }
      : collage
    localStorage.setItem(`livegallery-decor:${code}`, JSON.stringify({ stickers, collage: safeCollage }))
  } catch {
    /* Browser storage is optional. */
  }
}
