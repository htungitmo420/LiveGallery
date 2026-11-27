import {
  normalizeMediaFileName,
  saveMediaFileToDevice,
  type SaveMediaOutcome,
} from '../lib/gallery'
import {
  collageSize,
  type CollagePattern,
  type CollageSettings,
  type PlacedSticker,
} from './model'

const loadedImageCache = new Map<string, Promise<HTMLImageElement>>()

export function preloadDecorImage(source: string | undefined): void {
  if (!source) return
  void loadImage(source).catch(() => undefined)
}

function loadImage(source: string): Promise<HTMLImageElement> {
  const cached = loadedImageCache.get(source)
  if (cached) return cached

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => {
      loadedImageCache.delete(source)
      reject(new Error('Không thể tải ảnh để trang trí.'))
    }
    image.src = source
  })

  loadedImageCache.set(source, promise)
  return promise
}

export async function renderDecoratedStrip(source: string, stickers: PlacedSticker[]) {
  const base = await loadImage(source)
  const canvas = document.createElement('canvas')
  canvas.width = base.naturalWidth
  canvas.height = base.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Không thể tạo ảnh trang trí.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(base, 0, 0)

  const stickerImages = await Promise.all(stickers.map(async (sticker) => {
    if (sticker.kind !== 'image') return null
    try { return await loadImage(sticker.content) } catch { return null }
  }))
  stickers
    .map((sticker, index) => ({ sticker, image: stickerImages[index] }))
    .sort((a, b) => a.sticker.zIndex - b.sticker.zIndex)
    .forEach(({ sticker, image }) => {
      const size = sticker.size * canvas.width
      context.save()
      context.translate(sticker.x * canvas.width, sticker.y * canvas.height)
      context.rotate(sticker.rotation * Math.PI / 180)
      context.scale(sticker.flipX ? -1 : 1, 1)
      if (image) context.drawImage(image, -size / 2, -size / 2, size, size)
      else {
        context.font = `${size}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(sticker.content, 0, 0)
      }
      context.restore()
    })
  return canvas
}

function drawPattern(context: CanvasRenderingContext2D, width: number, height: number, pattern: CollagePattern) {
  if (pattern === 'solid') return
  context.save()
  context.fillStyle = 'rgba(255,255,255,.18)'
  context.strokeStyle = 'rgba(255,255,255,.13)'
  const gap = Math.max(20, width * 0.024)
  if (pattern === 'dots') {
    for (let y = gap / 2; y < height; y += gap) {
      for (let x = gap / 2; x < width; x += gap) {
        context.beginPath()
        context.arc(x, y, Math.max(2, width * 0.0018), 0, Math.PI * 2)
        context.fill()
      }
    }
  } else {
    context.lineWidth = Math.max(1, width * 0.001)
    context.beginPath()
    for (let x = 0; x <= width; x += gap) { context.moveTo(x, 0); context.lineTo(x, height) }
    for (let y = 0; y <= height; y += gap) { context.moveTo(0, y); context.lineTo(width, y) }
    context.stroke()
  }
  context.restore()
}

export async function renderCollage(source: string, stickers: PlacedSticker[], settings: CollageSettings) {
  const strip = await renderDecoratedStrip(source, stickers)
  const size = collageSize(settings.format)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Không thể tạo nền ghép.')
  context.fillStyle = settings.background
  context.fillRect(0, 0, canvas.width, canvas.height)
  if (settings.backgroundImageUrl) {
    try {
      const background = await loadImage(settings.backgroundImageUrl)
      const scale = Math.max(canvas.width / background.naturalWidth, canvas.height / background.naturalHeight)
      const width = background.naturalWidth * scale
      const height = background.naturalHeight * scale
      context.drawImage(background, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
    } catch { /* The selected color remains as a safe fallback. */ }
  }
  drawPattern(context, canvas.width, canvas.height, settings.pattern)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  settings.items.slice().sort((a, b) => a.zIndex - b.zIndex).forEach((item) => {
    const width = item.width * canvas.width
    const height = width * strip.height / strip.width
    context.save()
    context.translate(item.x * canvas.width, item.y * canvas.height)
    context.rotate(item.rotation * Math.PI / 180)
    context.shadowColor = 'rgba(20,12,8,.28)'
    context.shadowBlur = Math.max(10, canvas.width * 0.014)
    context.shadowOffsetY = Math.max(4, canvas.width * 0.006)
    context.drawImage(strip, -width / 2, -height / 2, width, height)
    context.restore()
  })
  const message = settings.message.trim()
  if (message) {
    const fontSize = Math.max(30, canvas.width * 0.045)
    const maxWidth = canvas.width * 0.84
    const words = message.slice(0, 80).split(/\s+/)
    const lines: string[] = []
    let line = ''

    context.save()
    context.font = `700 ${fontSize}px system-ui, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = settings.messageColor
    context.shadowColor = 'rgba(0,0,0,.4)'
    context.shadowBlur = Math.max(5, canvas.width * 0.005)
    context.shadowOffsetY = Math.max(2, canvas.width * 0.002)

    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word
      if (line && context.measureText(candidate).width > maxWidth && lines.length < 2) {
        lines.push(line)
        line = word
      } else {
        line = candidate
      }
    })
    if (line) lines.push(line)

    const lineHeight = fontSize * 1.18
    const blockHeight = lineHeight * lines.length
    const isTop = settings.messagePosition === 'top'
    const anchorY = isTop ? canvas.height * 0.07 : canvas.height * 0.93
    const startY = isTop ? anchorY : anchorY - blockHeight + lineHeight

    lines.slice(0, 3).forEach((text, index) => {
      context.fillText(text, canvas.width / 2, startY + index * lineHeight, maxWidth)
    })
    context.restore()
  }
  return canvas
}

export async function downloadCanvas(
  canvas: HTMLCanvasElement,
  prefix: string,
): Promise<SaveMediaOutcome> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error('Không thể mã hóa ảnh.')),
    'image/jpeg',
    0.96,
  ))
  const fileName = normalizeMediaFileName(`${prefix}-${Date.now()}`, 'image/jpeg', prefix)
  const file = new File([blob], fileName, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
  return saveMediaFileToDevice(file)
}
