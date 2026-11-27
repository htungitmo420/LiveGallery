import { getIntlLocaleTag, type Locale } from '../../i18n/core'
import {
  DIY_FILTERS,
  detectTransparentSlots,
  getDiyFrameSize,
  getDiyLayoutSlots,
  slotsMatchLayout,
} from './geometry'
import type { DiyFilterId, DiyFrame, DiyLayout, DiySlotRect } from './types'

interface FrameAnalysis {
  width: number
  height: number
  slots: DiySlotRect[]
}

const frameAnalysisCache = new Map<string, Promise<FrameAnalysis | null>>()

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    if (!source.startsWith('blob:') && !source.startsWith('data:')) {
      image.crossOrigin = 'anonymous'
    }
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Không thể tải ảnh để ghép khung.'))
    image.src = source
  })
}

function paintBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  value: string,
): void {
  if (value.startsWith('linear-gradient')) {
    const colors = value.match(/#[a-fA-F0-9]{6}/g) ?? ['#ffffff', '#f5f5f5']
    const gradient = context.createLinearGradient(0, 0, width, height)
    gradient.addColorStop(0, colors[0])
    gradient.addColorStop(1, colors[1] ?? colors[0])
    context.fillStyle = gradient
  } else {
    context.fillStyle = value
  }
  context.fillRect(0, 0, width, height)
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  slot: DiySlotRect,
  radius: number,
  filterCss: string,
): void {
  const naturalWidth = image.naturalWidth || image.width
  const naturalHeight = image.naturalHeight || image.height
  if (!naturalWidth || !naturalHeight) return

  const scale = Math.max(slot.width / naturalWidth, slot.height / naturalHeight)
  const drawWidth = naturalWidth * scale
  const drawHeight = naturalHeight * scale
  const drawX = slot.x + (slot.width - drawWidth) / 2
  const drawY = slot.y + (slot.height - drawHeight) / 2

  context.save()
  context.beginPath()
  if (typeof context.roundRect === 'function') {
    context.roundRect(slot.x, slot.y, slot.width, slot.height, radius)
  } else {
    context.rect(slot.x, slot.y, slot.width, slot.height)
  }
  context.clip()
  context.filter = filterCss
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight)
  context.filter = 'none'
  context.restore()
}

function drawEmptySlotPlaceholder(
  context: CanvasRenderingContext2D,
  slot: DiySlotRect,
  radius: number,
  index: number,
): void {
  context.save()
  context.beginPath()
  if (typeof context.roundRect === 'function') {
    context.roundRect(slot.x, slot.y, slot.width, slot.height, radius)
  } else {
    context.rect(slot.x, slot.y, slot.width, slot.height)
  }
  context.fillStyle = '#1b1917'
  context.fill()
  context.strokeStyle = 'rgba(229, 169, 60, 0.45)'
  context.lineWidth = Math.max(2, slot.width * 0.008)
  context.setLineDash([Math.max(8, slot.width * 0.03), Math.max(6, slot.width * 0.02)])
  context.stroke()
  context.setLineDash([])

  context.fillStyle = 'rgba(243, 239, 230, 0.72)'
  context.font = `600 ${Math.max(20, Math.round(slot.height * 0.16))}px "JetBrains Mono", monospace`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(String(index + 1).padStart(2, '0'), slot.x + slot.width / 2, slot.y + slot.height / 2)
  context.restore()
}

async function analyzeFrame(
  source: string,
  image: HTMLImageElement,
  expectedSlots: number,
): Promise<FrameAnalysis | null> {
  const cacheKey = `${source}::${expectedSlots}`
  const cached = frameAnalysisCache.get(cacheKey)
  if (cached) return cached

  const task = Promise.resolve().then(() => {
    const naturalWidth = image.naturalWidth || image.width
    const naturalHeight = image.naturalHeight || image.height
    if (!naturalWidth || !naturalHeight) return null

    const ratio = Math.min(1, 420 / Math.max(naturalWidth, naturalHeight))
    const width = Math.max(1, Math.round(naturalWidth * ratio))
    const height = Math.max(1, Math.round(naturalHeight * ratio))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.drawImage(image, 0, 0, width, height)
    try {
      const pixels = context.getImageData(0, 0, width, height).data
      const slots = detectTransparentSlots(pixels, width, height, expectedSlots)
      return slots.length === expectedSlots ? { width, height, slots } : null
    } catch {
      return null
    }
  })

  frameAnalysisCache.set(cacheKey, task)
  return task
}

export interface ComposeDiyStripOptions {
  layout: DiyLayout
  frame: DiyFrame
  photoUrls: readonly (string | null | undefined)[]
  filter: DiyFilterId
  caption?: string
  showDate?: boolean
  locale?: Locale
  scale?: number
}

export async function composeDiyStrip({
  layout,
  frame,
  photoUrls,
  filter,
  caption = '',
  showDate = true,
  locale = 'vi',
  scale = 1,
}: ComposeDiyStripOptions): Promise<HTMLCanvasElement> {
  const loadedPhotos = await Promise.all(
    Array.from({ length: layout.slots }, (_, index) => {
      const url = photoUrls[index]
      if (!url) return Promise.resolve(null)
      return loadImage(url).catch(() => null)
    }),
  )
  const overlay = frame.assetUrl ? await loadImage(frame.assetUrl).catch(() => null) : null

  const dimensions = getDiyFrameSize(layout, frame)
  const width = Math.max(2, Math.round(dimensions.width * scale))
  const height = Math.max(2, Math.round(dimensions.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Không thể tạo ảnh photobooth.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  const analysis = overlay && frame.assetUrl
    ? await analyzeFrame(frame.assetUrl, overlay, layout.slots)
    : null
  const validOverlaySlots = analysis && slotsMatchLayout(analysis.slots, layout) ? analysis : null

  const slots = validOverlaySlots
    ? validOverlaySlots.slots.map((slot) => ({
        x: (slot.x / validOverlaySlots.width) * width,
        y: (slot.y / validOverlaySlots.height) * height,
        width: (slot.width / validOverlaySlots.width) * width,
        height: (slot.height / validOverlaySlots.height) * height,
      }))
    : getDiyLayoutSlots(layout, width, height)

  const hasOverlay = Boolean(overlay)
  if (!hasOverlay) {
    paintBackground(context, width, height, frame.config.background)
  } else {
    context.fillStyle = frame.config.background || '#ffffff'
    context.fillRect(0, 0, width, height)
  }

  const filterCss = DIY_FILTERS.find((item) => item.id === filter)?.css ?? 'none'

  slots.forEach((slot, index) => {
    const image = loadedPhotos[index]
    const cornerRadius = hasOverlay ? 0 : frame.config.radius * scale * 0.7
    if (!hasOverlay) {
      context.fillStyle = frame.config.accent
      const border = Math.max(4, width * 0.012)
      context.beginPath()
      if (typeof context.roundRect === 'function') {
        context.roundRect(
          slot.x - border,
          slot.y - border,
          slot.width + border * 2,
          slot.height + border * 2,
          frame.config.radius * scale,
        )
      } else {
        context.rect(slot.x - border, slot.y - border, slot.width + border * 2, slot.height + border * 2)
      }
      context.fill()
    }
    if (image) {
      drawCover(context, image, slot, cornerRadius, filterCss)
    } else {
      drawEmptySlotPlaceholder(context, slot, cornerRadius, index)
    }
  })

  if (overlay) {
    context.drawImage(overlay, 0, 0, width, height)
  } else {
    context.fillStyle = frame.config.textColor
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    const captionSize = Math.max(18, width * 0.044)
    context.font = `700 ${captionSize}px "Playfair Display", Georgia, serif`
    const footerY = height - height * (layout.kind === 'grid' ? 0.085 : 0.065)
    const label = caption.trim() || 'KHOẢNH KHẮC'
    context.fillText(label.slice(0, 60), width / 2, footerY - (showDate ? captionSize * 0.45 : 0), width * 0.84)

    if (showDate) {
      context.globalAlpha = 0.74
      context.font = `500 ${Math.max(14, width * 0.022)}px "JetBrains Mono", monospace`
      context.fillText(
        new Intl.DateTimeFormat(getIntlLocaleTag(locale), {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(new Date()),
        width / 2,
        footerY + captionSize * 0.62,
      )
      context.globalAlpha = 1
    }
  }

  return canvas
}

export async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.96): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((value) => resolve(value), 'image/jpeg', quality),
  )
  if (!blob) throw new Error('Không thể mã hóa ảnh.')
  return blob
}
