import { type PointerEvent as ReactPointerEvent, useRef } from 'react'
import {
  collageSize,
  type CollageItem,
  type CollageSettings,
  type PlacedSticker,
} from '../../decor'
import { useLocale } from '../../i18n/useLocale'
import { isSafeMediaUrl } from '../../lib/gallery'
import { StripArtwork } from './StripArtwork'
import { trackPointerDrag } from './pointerDrag'

interface CollageStageProps {
  baseUrl: string
  baseAspect: number
  stickers: PlacedSticker[]
  collage: CollageSettings
  selectedItemId: string | null
  onSelectItem: (id: string) => void
  onUpdateItem: (id: string, changes: Partial<CollageItem>) => void
}

export function CollageStage({
  baseUrl,
  baseAspect,
  stickers,
  collage,
  selectedItemId,
  onSelectItem,
  onUpdateItem,
}: CollageStageProps) {
  const { messages } = useLocale()
  const stageRef = useRef<HTMLDivElement>(null)
  const output = collageSize(collage.format)

  const patternLayers = collage.pattern === 'dots'
    ? ['radial-gradient(rgba(255,255,255,.18) 1px, transparent 1px)']
    : collage.pattern === 'grid'
      ? ['linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px)', 'linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)']
      : []
  const safeBackgroundImageUrl = collage.backgroundImageUrl && isSafeMediaUrl(collage.backgroundImageUrl)
    ? collage.backgroundImageUrl
    : undefined
  const backgroundLayers = [...patternLayers, ...(safeBackgroundImageUrl ? [`url(${JSON.stringify(safeBackgroundImageUrl)})`] : [])]

  const startItemMove = (event: ReactPointerEvent<HTMLButtonElement>, item: CollageItem) => {
    const stage = stageRef.current
    if (!stage) return
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const originX = item.x
    const originY = item.y
    onSelectItem(item.id)
    const rect = stage.getBoundingClientRect()

    trackPointerDrag(event.pointerId, (next) => {
      const nextX = originX + (next.clientX - startX) / Math.max(1, rect.width)
      const nextY = originY + (next.clientY - startY) / Math.max(1, rect.height)
      onUpdateItem(item.id, {
        x: Math.min(1.12, Math.max(-0.12, nextX)),
        y: Math.min(1.12, Math.max(-0.12, nextY)),
      })
    })
  }

  return (
    <div
      className="decor-collage-stage"
      ref={stageRef}
      style={{
        aspectRatio: `${output.width}/${output.height}`,
        ['--stage-aspect' as string]: output.width / output.height,
        backgroundColor: collage.background,
        backgroundImage: backgroundLayers.length ? backgroundLayers.join(',') : undefined,
        backgroundSize: `${patternLayers.map(() => '24px 24px').join(',')}${patternLayers.length && safeBackgroundImageUrl ? ',' : ''}${safeBackgroundImageUrl ? 'cover' : ''}` || undefined,
        backgroundPosition: safeBackgroundImageUrl ? '0 0,0 0,center' : undefined,
      }}
    >
      {collage.items.slice().sort((a, b) => a.zIndex - b.zIndex).map((item) => (
        <button
          aria-label={messages.decor.moveStripAria}
          className={selectedItemId === item.id ? 'decor-collage-item selected' : 'decor-collage-item'}
          key={item.id}
          onPointerDown={(event) => startItemMove(event, item)}
          style={{
            left: `${item.x * 100}%`,
            top: `${item.y * 100}%`,
            width: `${item.width * 100}%`,
            aspectRatio: baseAspect,
            transform: `translate(-50%,-50%) rotate(${item.rotation}deg)`,
            zIndex: item.zIndex,
          }}
          type="button"
        >
          <StripArtwork source={baseUrl} stickers={stickers} />
        </button>
      ))}
      {collage.message.trim() && (
        <p
          className={collage.messagePosition === 'top' ? 'decor-message decor-message--top' : 'decor-message'}
          style={{ color: collage.messageColor }}
        >
          {collage.message}
        </p>
      )}
    </div>
  )
}
