import { type PointerEvent as ReactPointerEvent, useRef } from 'react'
import {
  clampStickerSize,
  getStickerToolbarPosition,
  movePlacedSticker,
  normalizeStickerRotation,
  transformStickerByGesture,
  type PlacedSticker,
} from '../../decor'
import { useLocale } from '../../i18n/useLocale'
import { trackPointerDrag } from './pointerDrag'

interface StickerStageProps {
  baseUrl: string
  baseAspect: number
  stickers: PlacedSticker[]
  selectedSticker: PlacedSticker | null
  topStickerZIndex: number
  onBaseAspectLoad: (aspect: number) => void
  onSelectSticker: (id: string | null) => void
  onUpdateSticker: (id: string, changes: Partial<PlacedSticker>) => void
  onDuplicateSticker: (sticker: PlacedSticker) => void
  onDeleteSticker: (id: string) => void
}

export function StickerStage({
  baseUrl,
  baseAspect,
  stickers,
  selectedSticker,
  topStickerZIndex,
  onBaseAspectLoad,
  onSelectSticker,
  onUpdateSticker,
  onDuplicateSticker,
  onDeleteSticker,
}: StickerStageProps) {
  const { messages } = useLocale()
  const stageRef = useRef<HTMLDivElement>(null)
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const dragCancelRef = useRef<(() => void) | null>(null)
  const toolbarPos = selectedSticker ? getStickerToolbarPosition(selectedSticker) : null

  const onStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointers = activePointersRef.current
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

    const cleanupPointer = (next: PointerEvent) => {
      if (next.pointerId !== event.pointerId) return
      pointers.delete(next.pointerId)
      window.removeEventListener('pointerup', cleanupPointer)
      window.removeEventListener('pointercancel', cleanupPointer)
    }
    window.addEventListener('pointerup', cleanupPointer)
    window.addEventListener('pointercancel', cleanupPointer)

    if (pointers.size === 2 && selectedSticker) {
      dragCancelRef.current?.()
      const [first, second] = Array.from(pointers.values())
      const initialDistance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y))
      const initialAngle = Math.atan2(second.y - first.y, second.x - first.x)
      const initialSize = selectedSticker.size
      const initialRotation = selectedSticker.rotation
      const stickerId = selectedSticker.placementId

      const onPinchMove = (next: PointerEvent) => {
        if (!pointers.has(next.pointerId)) return
        pointers.set(next.pointerId, { x: next.clientX, y: next.clientY })
        if (pointers.size < 2) return
        const [p1, p2] = Array.from(pointers.values())
        const currentDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y)
        const currentAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
        onUpdateSticker(
          stickerId,
          transformStickerByGesture(
            { size: initialSize, rotation: initialRotation },
            initialDistance,
            currentDistance,
            initialAngle,
            currentAngle,
          ),
        )
      }
      const stopPinch = () => {
        if (pointers.size >= 2) return
        window.removeEventListener('pointermove', onPinchMove)
        window.removeEventListener('pointerup', stopPinch)
        window.removeEventListener('pointercancel', stopPinch)
      }
      window.addEventListener('pointermove', onPinchMove)
      window.addEventListener('pointerup', stopPinch)
      window.addEventListener('pointercancel', stopPinch)
      return
    }

    const target = event.target
    if (
      pointers.size === 1
      && (target === event.currentTarget || (target instanceof HTMLImageElement && target.parentElement === event.currentTarget))
    ) {
      onSelectSticker(null)
    }
  }

  const startStickerMove = (event: ReactPointerEvent<HTMLButtonElement>, sticker: PlacedSticker) => {
    const stage = stageRef.current
    if (!stage || activePointersRef.current.size >= 2) return
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const originX = sticker.x
    const originY = sticker.y
    const rect = stage.getBoundingClientRect()
    const nextZ = sticker.zIndex === topStickerZIndex - 1 ? sticker.zIndex : topStickerZIndex
    onSelectSticker(sticker.placementId)
    if (nextZ !== sticker.zIndex) onUpdateSticker(sticker.placementId, { zIndex: nextZ })

    const cancel = trackPointerDrag(
      event.pointerId,
      (next) => {
        if (activePointersRef.current.size >= 2) return
        const deltaX = (next.clientX - startX) / Math.max(1, rect.width)
        const deltaY = (next.clientY - startY) / Math.max(1, rect.height)
        onUpdateSticker(sticker.placementId, movePlacedSticker({ x: originX, y: originY }, deltaX, deltaY))
      },
      () => {
        if (dragCancelRef.current === cancel) dragCancelRef.current = null
      },
    )
    dragCancelRef.current = cancel
  }

  const startStickerResize = (event: ReactPointerEvent<HTMLButtonElement>, sticker: PlacedSticker) => {
    const stage = stageRef.current
    if (!stage) return
    event.preventDefault()
    event.stopPropagation()
    onSelectSticker(sticker.placementId)
    const rect = stage.getBoundingClientRect()
    const centerX = rect.left + sticker.x * rect.width
    const centerY = rect.top + sticker.y * rect.height
    const initialDistance = Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY))

    trackPointerDrag(event.pointerId, (next) => {
      const distance = Math.hypot(next.clientX - centerX, next.clientY - centerY)
      onUpdateSticker(sticker.placementId, { size: clampStickerSize(sticker.size * distance / initialDistance) })
    })
  }

  const startStickerRotate = (event: ReactPointerEvent<HTMLButtonElement>, sticker: PlacedSticker) => {
    const stage = stageRef.current
    if (!stage) return
    event.preventDefault()
    event.stopPropagation()
    onSelectSticker(sticker.placementId)
    const rect = stage.getBoundingClientRect()
    const centerX = rect.left + sticker.x * rect.width
    const centerY = rect.top + sticker.y * rect.height
    const initialAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX)

    trackPointerDrag(event.pointerId, (next) => {
      const angle = Math.atan2(next.clientY - centerY, next.clientX - centerX)
      onUpdateSticker(sticker.placementId, {
        rotation: normalizeStickerRotation(sticker.rotation + (angle - initialAngle) * 180 / Math.PI),
      })
    })
  }

  return (
    <div
      className="decor-strip-stage"
      onPointerDown={onStagePointerDown}
      ref={stageRef}
      style={{ aspectRatio: baseAspect, ['--stage-aspect' as string]: baseAspect }}
    >
      <img
        alt={messages.decor.stripAlt}
        crossOrigin="anonymous"
        draggable={false}
        onLoad={(event) => onBaseAspectLoad(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)}
        src={baseUrl}
      />
      {stickers.slice().sort((a, b) => a.zIndex - b.zIndex).map((sticker) => {
        const selected = selectedSticker?.placementId === sticker.placementId
        return (
          <div
            className={selected ? 'decor-sticker-node selected' : 'decor-sticker-node'}
            key={sticker.placementId}
            style={{
              left: `${sticker.x * 100}%`,
              top: `${sticker.y * 100}%`,
              width: `${sticker.size * 100}%`,
              zIndex: selected ? topStickerZIndex : sticker.zIndex,
            }}
          >
            <button
              aria-label={messages.decor.moveStickerAria(sticker.name)}
              className="decor-sticker"
              onClick={() => onSelectSticker(sticker.placementId)}
              onPointerDown={(event) => startStickerMove(event, sticker)}
              style={{ transform: `rotate(${sticker.rotation}deg)${sticker.flipX ? ' scaleX(-1)' : ''}` }}
              type="button"
            >
              {sticker.kind === 'image' ? (
                <img alt="" crossOrigin="anonymous" draggable={false} src={sticker.content} />
              ) : (
                sticker.content
              )}
            </button>
          </div>
        )
      })}
      {selectedSticker && toolbarPos && (
        <div
          aria-label={messages.decor.stickerToolbarAria(selectedSticker.name)}
          className="decor-sticker-toolbar"
          style={{
            left: `${toolbarPos.left * 100}%`,
            top: `${toolbarPos.top * 100}%`,
            zIndex: topStickerZIndex + 1,
          }}
        >
          <button
            aria-label={messages.decor.rotateStickerAria(selectedSticker.name)}
            onPointerDown={(event) => startStickerRotate(event, selectedSticker)}
            title={messages.decor.rotateStickerTitle}
            type="button"
          >
            ↻
          </button>
          <button
            aria-label={messages.decor.flipStickerAria(selectedSticker.name)}
            onClick={() => onUpdateSticker(selectedSticker.placementId, { flipX: !selectedSticker.flipX })}
            title={messages.decor.flipStickerTitle}
            type="button"
          >
            ↔
          </button>
          <button
            aria-label={messages.decor.duplicateStickerAria(selectedSticker.name)}
            onClick={() => onDuplicateSticker(selectedSticker)}
            title={messages.decor.duplicateStickerTitle}
            type="button"
          >
            ⧉
          </button>
          <button
            aria-label={messages.decor.resizeStickerAria(selectedSticker.name)}
            onPointerDown={(event) => startStickerResize(event, selectedSticker)}
            title={messages.decor.resizeStickerTitle}
            type="button"
          >
            ↘
          </button>
          <button
            aria-label={messages.decor.deleteStickerAria(selectedSticker.name)}
            className="delete"
            onClick={() => onDeleteSticker(selectedSticker.placementId)}
            title={messages.decor.deleteStickerTitle}
            type="button"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
