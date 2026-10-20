export type DecorMode = 'stickers' | 'background'
export type CollageFormat = 'landscape' | 'square' | 'portrait' | 'story'
export type CollagePattern = 'solid' | 'dots' | 'grid'

export interface DecorStickerAsset {
  id: string
  name: string
  kind: 'emoji' | 'image'
  content: string
}

export interface PlacedSticker extends DecorStickerAsset {
  placementId: string
  x: number
  y: number
  size: number
  rotation: number
  zIndex: number
}

export function duplicatePlacedSticker(source: PlacedSticker, placementId: string, zIndex: number): PlacedSticker {
  return {
    ...source,
    placementId,
    x: Math.min(1.1, source.x + .04),
    y: Math.min(1.1, source.y + .04),
    zIndex,
  }
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
  items: CollageItem[]
}

export const COLLAGE_FORMATS: Array<{ id: CollageFormat; label: string; width: number; height: number }> = [
  { id: 'landscape', label: '16:9', width: 1920, height: 1080 },
  { id: 'square', label: '1:1', width: 1440, height: 1440 },
  { id: 'portrait', label: '4:5', width: 1440, height: 1800 },
  { id: 'story', label: '9:16', width: 1440, height: 2560 },
]

export const FALLBACK_STICKERS: DecorStickerAsset[] = [
  ['rabbit', 'Thỏ', '🐰'], ['bear', 'Gấu', '🧸'], ['bow', 'Nơ', '🎀'], ['heart', 'Trái tim', '💗'],
  ['chick', 'Gà con', '🐥'], ['cat', 'Mèo', '🐱'], ['flower', 'Hoa', '🌸'], ['sparkle', 'Lấp lánh', '✨'],
  ['clover', 'Cỏ may mắn', '🍀'], ['cherry', 'Anh đào', '🍒'], ['sun', 'Mặt trời', '☀️'], ['rainbow', 'Cầu vồng', '🌈'],
].map(([id, name, content]) => ({ id: `emoji-${id}`, name, content, kind: 'emoji' }))

export const DEFAULT_COLLAGE: CollageSettings = {
  format: 'story',
  background: '#5a3822',
  pattern: 'solid',
  message: '',
  messageColor: '#ffffff',
  items: [{ id: 'strip-main', x: .5, y: .5, width: .42, rotation: 0, zIndex: 1 }],
}

export function collageSize(format: CollageFormat) {
  return COLLAGE_FORMATS.find((item) => item.id === format) ?? COLLAGE_FORMATS[3]
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Không thể tải ảnh để trang trí.'))
    image.src = source
  })
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
  const gap = Math.max(20, width * .024)
  if (pattern === 'dots') {
    for (let y = gap / 2; y < height; y += gap) for (let x = gap / 2; x < width; x += gap) {
      context.beginPath()
      context.arc(x, y, Math.max(2, width * .0018), 0, Math.PI * 2)
      context.fill()
    }
  } else {
    context.lineWidth = Math.max(1, width * .001)
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
    context.shadowBlur = Math.max(10, canvas.width * .014)
    context.shadowOffsetY = Math.max(4, canvas.width * .006)
    context.drawImage(strip, -width / 2, -height / 2, width, height)
    context.restore()
  })
  const message = settings.message.trim()
  if (message) {
    context.fillStyle = settings.messageColor
    context.textAlign = 'center'
    context.textBaseline = 'bottom'
    context.font = `700 ${Math.max(30, canvas.width * .045)}px system-ui, sans-serif`
    context.shadowColor = 'rgba(0,0,0,.4)'
    context.shadowBlur = Math.max(5, canvas.width * .005)
    context.fillText(message.slice(0, 80), canvas.width / 2, canvas.height * .95, canvas.width * .86)
  }
  return canvas
}

export async function downloadCanvas(canvas: HTMLCanvasElement, prefix: string) {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error('Không thể mã hóa ảnh.')),
    'image/jpeg',
    .96,
  ))
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${prefix}-${Date.now()}.jpg`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}
