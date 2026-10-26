import { useEffect, useMemo, useRef, useState } from 'react'
import {
  COLLAGE_FORMATS,
  DEFAULT_COLLAGE,
  FALLBACK_STICKERS,
  clampStickerSize,
  collageSize,
  downloadCanvas,
  duplicatePlacedSticker,
  getStickerToolbarPosition,
  movePlacedSticker,
  normalizeStickerRotation,
  renderCollage,
  renderDecoratedStrip,
  transformStickerByGesture,
  type CollageItem,
  type CollageSettings,
  type DecorMode,
  type DecorStickerAsset,
  type PlacedSticker,
} from './decor'
import { deleteLocalBackground, loadLocalBackgrounds, saveLocalBackground, type LocalBackground } from './lib/localBackgrounds'
import type { GalleryAlbum } from './lib/gallery'

const COLORS = ['#5a3822', '#171717', '#f4e7d3', '#d98282', '#6c7c63', '#596b8d', '#f7f2ea']
const MAX_ITEMS = 6

interface StoredDecor {
  stickers: PlacedSticker[]
  collage: CollageSettings
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function readStoredDecor(code: string): StoredDecor {
  try {
    const raw = localStorage.getItem(`livegallery-decor:${code}`)
    if (!raw) return { stickers: [], collage: DEFAULT_COLLAGE }
    const parsed = JSON.parse(raw) as Partial<StoredDecor>
    return {
      stickers: Array.isArray(parsed.stickers) ? parsed.stickers : [],
      collage: parsed.collage && Array.isArray(parsed.collage.items)
        ? { ...DEFAULT_COLLAGE, ...parsed.collage }
        : DEFAULT_COLLAGE,
    }
  } catch {
    return { stickers: [], collage: DEFAULT_COLLAGE }
  }
}

function StripArtwork({ source, stickers }: { source: string; stickers: PlacedSticker[] }) {
  return <div className="decor-strip-artwork">
    <img alt="" draggable={false} src={source} />
    {stickers.slice().sort((a, b) => a.zIndex - b.zIndex).map((sticker) => <span
      className="decor-sticker-render"
      key={sticker.placementId}
      style={{
        left: `${sticker.x * 100}%`,
        top: `${sticker.y * 100}%`,
        width: `${sticker.size * 100}%`,
        transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg)`,
        zIndex: sticker.zIndex,
      }}
    >{sticker.kind === 'image' ? <img alt="" draggable={false} src={sticker.content} /> : <span>{sticker.content}</span>}</span>)}
  </div>
}

interface Props { album: GalleryAlbum; onClose: () => void }

export function DecorStudio({ album, onClose }: Props) {
  const base = album.items.find((item) => item.fileName.startsWith('photobooth.'))
    ?? album.items.find((item) => item.kind === 'image')
  const initial = useMemo(() => readStoredDecor(album.shareCode), [album.shareCode])
  const [mode, setMode] = useState<DecorMode>('stickers')
  const [stickers, setStickers] = useState<PlacedSticker[]>(initial.stickers)
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null)
  const [collage, setCollage] = useState<CollageSettings>(initial.collage)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(initial.collage.items[0]?.id ?? null)
  const [baseAspect, setBaseAspect] = useState(.42)
  const [localBackgrounds, setLocalBackgrounds] = useState<LocalBackground[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const backgroundInputRef = useRef<HTMLInputElement>(null)
  const stickerStageRef = useRef<HTMLDivElement>(null)
  const collageStageRef = useRef<HTMLDivElement>(null)
  const stickerClipboardRef = useRef<PlacedSticker | null>(null)
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const dragCancelRef = useRef<(() => void) | null>(null)

  const assets: DecorStickerAsset[] = useMemo(() => [
    ...album.stickers.map((item) => ({ id: item.id, name: item.name, kind: 'image' as const, content: item.url })),
    ...FALLBACK_STICKERS,
  ], [album.stickers])
  const selectedSticker = stickers.find((item) => item.placementId === selectedStickerId) ?? null
  const selectedItem = collage.items.find((item) => item.id === selectedItemId) ?? null
  const output = collageSize(collage.format)
  const topStickerZIndex = Math.max(0, ...stickers.map((item) => item.zIndex)) + 1
  const toolbarPos = selectedSticker ? getStickerToolbarPosition(selectedSticker) : null

  useEffect(() => {
    let disposed = false
    let loaded: LocalBackground[] = []
    loadLocalBackgrounds().then((items) => {
      loaded = items
      if (!disposed) setLocalBackgrounds(items)
      else items.forEach((item) => URL.revokeObjectURL(item.url))
    }).catch(() => undefined)
    return () => { disposed = true; loaded.forEach((item) => URL.revokeObjectURL(item.url)) }
  }, [])

  useEffect(() => {
    try {
      const safeCollage = collage.backgroundImageUrl?.startsWith('blob:')
        ? { ...collage, backgroundImageUrl: undefined }
        : collage
      localStorage.setItem(`livegallery-decor:${album.shareCode}`, JSON.stringify({ stickers, collage: safeCollage }))
    } catch { /* Browser storage is optional. */ }
  }, [album.shareCode, collage, stickers])

  const duplicateSticker = (source: PlacedSticker, noticeMessage = 'Đã nhân bản sticker.') => {
    if (stickers.length >= 20) {
      setNotice('Mỗi ảnh dùng tối đa 20 sticker.')
      return
    }
    const placementId = makeId('sticker')
    const zIndex = Math.max(0, ...stickers.map((item) => item.zIndex)) + 1
    setStickers((current) => [...current, duplicatePlacedSticker(source, placementId, zIndex)])
    setSelectedStickerId(placementId)
    setNotice(noticeMessage)
  }

  useEffect(() => {
    if (mode !== 'stickers') return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      const shortcut = event.ctrlKey || event.metaKey

      if (shortcut && event.key.toLowerCase() === 'c' && selectedSticker) {
        event.preventDefault()
        stickerClipboardRef.current = { ...selectedSticker }
        setNotice('Đã sao chép sticker. Nhấn Ctrl+V để dán.')
        return
      }

      if (shortcut && event.key.toLowerCase() === 'v' && stickerClipboardRef.current) {
        event.preventDefault()
        if (stickers.length >= 20) {
          setNotice('Mỗi ảnh dùng tối đa 20 sticker.')
          return
        }
        const source = stickerClipboardRef.current
        const placementId = makeId('sticker')
        const zIndex = Math.max(0, ...stickers.map((item) => item.zIndex)) + 1
        setStickers((current) => [...current, duplicatePlacedSticker(source, placementId, zIndex)])
        setSelectedStickerId(placementId)
        setNotice('Đã dán một bản sao sticker.')
        return
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedStickerId) {
        event.preventDefault()
        setStickers((current) => current.filter((item) => item.placementId !== selectedStickerId))
        setSelectedStickerId(null)
        setNotice('Đã xóa sticker.')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, selectedSticker, selectedStickerId, stickers])

  if (!base) return <section className="decor-empty"><h2>Chưa có ảnh photobooth để trang trí</h2><button onClick={onClose}>Quay lại album</button></section>

  const addSticker = (asset: DecorStickerAsset) => {
    if (stickers.length >= 20) return setNotice('Mỗi ảnh dùng tối đa 20 sticker.')
    const next: PlacedSticker = {
      ...asset,
      placementId: makeId('sticker'),
      x: .5,
      y: .18 + Math.min(.25, stickers.length * .035),
      size: .14,
      rotation: 0,
      zIndex: topStickerZIndex,
    }
    setStickers((current) => [...current, next])
    setSelectedStickerId(next.placementId)
  }

  const updateSticker = (id: string, changes: Partial<PlacedSticker>) => {
    setStickers((current) => current.map((item) => item.placementId === id ? { ...item, ...changes } : item))
  }

  const onStagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
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
        updateSticker(
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
      setSelectedStickerId(null)
    }
  }

  const startStickerMove = (event: React.PointerEvent<HTMLButtonElement>, sticker: PlacedSticker) => {
    const stage = stickerStageRef.current
    if (!stage || activePointersRef.current.size >= 2) return
    event.preventDefault()
    const pointerId = event.pointerId
    const startX = event.clientX
    const startY = event.clientY
    const originX = sticker.x
    const originY = sticker.y
    const rect = stage.getBoundingClientRect()
    const nextZ = sticker.zIndex === topStickerZIndex - 1 ? sticker.zIndex : topStickerZIndex
    setSelectedStickerId(sticker.placementId)
    if (nextZ !== sticker.zIndex) updateSticker(sticker.placementId, { zIndex: nextZ })

    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId || activePointersRef.current.size >= 2) return
      const deltaX = (next.clientX - startX) / Math.max(1, rect.width)
      const deltaY = (next.clientY - startY) / Math.max(1, rect.height)
      updateSticker(sticker.placementId, movePlacedSticker({ x: originX, y: originY }, deltaX, deltaY))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      if (dragCancelRef.current === stop) dragCancelRef.current = null
    }
    dragCancelRef.current = stop
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  const startStickerResize = (event: React.PointerEvent<HTMLButtonElement>, sticker: PlacedSticker) => {
    const stage = stickerStageRef.current
    if (!stage) return
    event.preventDefault()
    event.stopPropagation()
    setSelectedStickerId(sticker.placementId)
    const pointerId = event.pointerId
    const rect = stage.getBoundingClientRect()
    const centerX = rect.left + sticker.x * rect.width
    const centerY = rect.top + sticker.y * rect.height
    const initialDistance = Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY))
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return
      const distance = Math.hypot(next.clientX - centerX, next.clientY - centerY)
      updateSticker(sticker.placementId, { size: clampStickerSize(sticker.size * distance / initialDistance) })
    }
    const stop = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  const startStickerRotate = (event: React.PointerEvent<HTMLButtonElement>, sticker: PlacedSticker) => {
    const stage = stickerStageRef.current
    if (!stage) return
    event.preventDefault()
    event.stopPropagation()
    setSelectedStickerId(sticker.placementId)
    const pointerId = event.pointerId
    const rect = stage.getBoundingClientRect()
    const centerX = rect.left + sticker.x * rect.width
    const centerY = rect.top + sticker.y * rect.height
    const initialAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX)
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return
      const angle = Math.atan2(next.clientY - centerY, next.clientX - centerX)
      updateSticker(sticker.placementId, { rotation: normalizeStickerRotation(sticker.rotation + (angle - initialAngle) * 180 / Math.PI) })
    }
    const stop = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  const updateItem = (id: string, changes: Partial<CollageItem>) => {
    setCollage((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, ...changes } : item) }))
  }

  const startItemMove = (event: React.PointerEvent<HTMLButtonElement>, item: CollageItem) => {
    const stage = collageStageRef.current
    if (!stage) return
    event.preventDefault()
    const pointerId = event.pointerId
    const startX = event.clientX
    const startY = event.clientY
    const originX = item.x
    const originY = item.y
    setSelectedItemId(item.id)
    const rect = stage.getBoundingClientRect()
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return
      const nextX = originX + (next.clientX - startX) / Math.max(1, rect.width)
      const nextY = originY + (next.clientY - startY) / Math.max(1, rect.height)
      updateItem(item.id, {
        x: Math.min(1.12, Math.max(-.12, nextX)),
        y: Math.min(1.12, Math.max(-.12, nextY)),
      })
    }
    const stop = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  const addCopy = () => {
    if (collage.items.length >= MAX_ITEMS) return
    const source = selectedItem ?? collage.items.at(-1)!
    const copy = { ...source, id: makeId('strip'), x: Math.min(1, source.x + .08), y: Math.min(1, source.y + .06), zIndex: collage.items.length + 1 }
    setCollage((current) => ({ ...current, items: [...current.items, copy] }))
    setSelectedItemId(copy.id)
  }

  const chooseTwo = () => {
    const items: CollageItem[] = [
      { id: makeId('strip'), x: .34, y: .55, width: .42, rotation: -8, zIndex: 1 },
      { id: makeId('strip'), x: .68, y: .49, width: .42, rotation: 8, zIndex: 2 },
    ]
    setCollage((current) => ({ ...current, items }))
    setSelectedItemId(items[1].id)
  }

  const addLocal = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const item = await saveLocalBackground(file)
      setLocalBackgrounds((current) => [item, ...current])
      setCollage((current) => ({ ...current, backgroundImageUrl: item.url }))
      setNotice('Đã lưu nền trên thiết bị này.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Không thể thêm nền.') }
  }

  const removeLocal = async (item: LocalBackground) => {
    await deleteLocalBackground(item.id)
    setCollage((current) => current.backgroundImageUrl === item.url ? { ...current, backgroundImageUrl: undefined } : current)
    setLocalBackgrounds((current) => current.filter((candidate) => candidate.id !== item.id))
    URL.revokeObjectURL(item.url)
  }

  const exportDecor = async () => {
    setBusy(true)
    setNotice('Đang tạo ảnh chất lượng cao…')
    try {
      const canvas = mode === 'background'
        ? await renderCollage(base.url, stickers, collage)
        : await renderDecoratedStrip(base.url, stickers)
      await downloadCanvas(canvas, mode === 'background' ? 'livegallery-collage' : 'livegallery-sticker')
      setNotice('Ảnh đã được tải xuống.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Không thể tạo ảnh.') }
    finally { setBusy(false) }
  }

  const patternLayers = collage.pattern === 'dots'
    ? ['radial-gradient(rgba(255,255,255,.18) 1px, transparent 1px)']
    : collage.pattern === 'grid'
      ? ['linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px)', 'linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)']
      : []
  const backgroundLayers = [...patternLayers, ...(collage.backgroundImageUrl ? [`url(${JSON.stringify(collage.backgroundImageUrl)})`] : [])]

  return <section className="decor-studio">
    <div className="decor-studio__bar">
      <div className="decor-studio__title"><p className="eyebrow">TRANG TRÍ SAU KHI CHỤP</p><h1>Thêm dấu ấn của bạn</h1></div>
      <div className="decor-studio__actions"><button type="button" onClick={onClose}>← Album</button><button type="button" className="accent" disabled={busy} onClick={() => void exportDecor()}>{busy ? 'Đang tạo…' : <>Tải ảnh<span className="desktop-only"> hoàn chỉnh</span></>}</button></div>
    </div>
    <div className="decor-tabs" role="tablist">
      <button type="button" className={mode === 'stickers' ? 'selected' : ''} onClick={() => setMode('stickers')}>Sticker ({stickers.length})</button>
      <button type="button" className={mode === 'background' ? 'selected' : ''} onClick={() => setMode('background')}>Nền ghép ({collage.items.length})</button>
    </div>
    <div className="decor-workspace">
      <div className="decor-preview">
        {mode === 'stickers' ? <div
          className="decor-strip-stage"
          onPointerDown={onStagePointerDown}
          ref={stickerStageRef}
          style={{ aspectRatio: baseAspect, ['--stage-aspect' as string]: baseAspect }}
        >
          <img alt="Ảnh photobooth" draggable={false} src={base.url} onLoad={(event) => setBaseAspect(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} />
          {stickers.slice().sort((a, b) => a.zIndex - b.zIndex).map((sticker) => {
            const selected = selectedStickerId === sticker.placementId
            return <div
              className={selected ? 'decor-sticker-node selected' : 'decor-sticker-node'}
              key={sticker.placementId}
              style={{ left: `${sticker.x * 100}%`, top: `${sticker.y * 100}%`, width: `${sticker.size * 100}%`, zIndex: selected ? topStickerZIndex : sticker.zIndex }}
            >
              <button
                type="button"
                aria-label={`Di chuyển ${sticker.name}`}
                className="decor-sticker"
                onClick={() => setSelectedStickerId(sticker.placementId)}
                onPointerDown={(event) => startStickerMove(event, sticker)}
                style={{ transform: `rotate(${sticker.rotation}deg)` }}
              >{sticker.kind === 'image' ? <img alt="" draggable={false} src={sticker.content} /> : sticker.content}</button>
            </div>
          })}
          {selectedSticker && toolbarPos && <div
            className="decor-sticker-toolbar"
            aria-label={`Công cụ cho sticker ${selectedSticker.name}`}
            style={{
              left: `${toolbarPos.left * 100}%`,
              top: `${toolbarPos.top * 100}%`,
              zIndex: topStickerZIndex + 1,
            }}
          >
            <button type="button" onPointerDown={(event) => startStickerRotate(event, selectedSticker)} aria-label={`Giữ và kéo để xoay ${selectedSticker.name}`} title="Giữ và kéo để xoay">↻</button>
            <button type="button" onClick={() => duplicateSticker(selectedSticker)} aria-label={`Nhân bản ${selectedSticker.name}`} title="Nhân bản sticker">⧉</button>
            <button type="button" onPointerDown={(event) => startStickerResize(event, selectedSticker)} aria-label={`Giữ và kéo để đổi kích thước ${selectedSticker.name}`} title="Giữ và kéo để đổi kích thước">↘</button>
            <button type="button" className="delete" onClick={() => { setStickers((current) => current.filter((item) => item.placementId !== selectedSticker.placementId)); setSelectedStickerId(null) }} aria-label={`Xóa ${selectedSticker.name}`} title="Xóa sticker">×</button>
          </div>}
        </div> : <div
          className="decor-collage-stage"
          ref={collageStageRef}
          style={{
            aspectRatio: `${output.width}/${output.height}`,
            ['--stage-aspect' as string]: output.width / output.height,
            backgroundColor: collage.background,
            backgroundImage: backgroundLayers.length ? backgroundLayers.join(',') : undefined,
            backgroundSize: `${patternLayers.map(() => '24px 24px').join(',')}${patternLayers.length && collage.backgroundImageUrl ? ',' : ''}${collage.backgroundImageUrl ? 'cover' : ''}` || undefined,
            backgroundPosition: collage.backgroundImageUrl ? '0 0,0 0,center' : undefined,
          }}
        >
          {collage.items.slice().sort((a, b) => a.zIndex - b.zIndex).map((item) => <button
            type="button"
            className={selectedItemId === item.id ? 'decor-collage-item selected' : 'decor-collage-item'}
            key={item.id}
            onPointerDown={(event) => startItemMove(event, item)}
            style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, width: `${item.width * 100}%`, aspectRatio: baseAspect, transform: `translate(-50%,-50%) rotate(${item.rotation}deg)`, zIndex: item.zIndex }}
          ><StripArtwork source={base.url} stickers={stickers} /></button>)}
          {collage.message.trim() && <p className="decor-message" style={{ color: collage.messageColor }}>{collage.message}</p>}
        </div>}
      </div>

      <aside className="decor-controls">
        {mode === 'stickers' ? <>
          {selectedSticker && <div className="decor-sliders decor-sliders--top">
            <div className="decor-sliders__header">
              <strong>Đang chỉnh: {selectedSticker.name}</strong>
              <div className="decor-quick-actions">
                <button type="button" onClick={() => duplicateSticker(selectedSticker)}>Nhân bản</button>
                <button type="button" onClick={() => updateSticker(selectedSticker.placementId, { rotation: 0 })}>0°</button>
                <button type="button" className="danger" onClick={() => { setStickers((current) => current.filter((item) => item.placementId !== selectedSticker.placementId)); setSelectedStickerId(null) }}>Xóa</button>
                <button type="button" onClick={() => setSelectedStickerId(null)}>Xong</button>
              </div>
            </div>
            <label><span>Kích thước <b>{Math.round(selectedSticker.size * 100)}%</b></span><input type="range" min={.05} max={.4} step={.01} value={selectedSticker.size} onChange={(event) => updateSticker(selectedSticker.placementId, { size: Number(event.target.value) })} /></label>
            <label><span>Xoay <b>{selectedSticker.rotation}°</b></span><input type="range" min={-180} max={180} value={selectedSticker.rotation} onChange={(event) => updateSticker(selectedSticker.placementId, { rotation: Number(event.target.value) })} /></label>
          </div>}
          <div className="decor-section-title"><h2>Chọn sticker</h2><span>{album.stickers.length ? 'Supabase + có sẵn' : 'Có sẵn'}</span></div>
          <div className={selectedSticker ? 'decor-sticker-library decor-sticker-library--compact' : 'decor-sticker-library'}>
            {assets.map((asset) => <button type="button" key={asset.id} onClick={() => addSticker(asset)} title={asset.name}>{asset.kind === 'image' ? <img alt={asset.name} src={asset.content} /> : <span>{asset.content}</span>}</button>)}
          </div>
          <p className={selectedSticker ? 'decor-help decor-help--selected' : 'decor-help'}>Kéo để di chuyển, dùng 2 ngón tay để phóng to / xoay, hoặc chạm nền để bỏ chọn.<span className="desktop-only"> Trên máy tính: Delete để xóa, Ctrl+C/Ctrl+V để sao chép.</span></p>
        </> : <>
          {selectedItem && <div className="decor-sliders decor-sliders--top">
            <div className="decor-sliders__header">
              <strong>Dải ảnh đang chọn</strong>
              <div className="decor-quick-actions">
                <button type="button" onClick={() => updateItem(selectedItem.id, { rotation: 0 })}>0°</button>
                <button type="button" className="danger" disabled={collage.items.length <= 1} onClick={() => { setCollage((current) => ({ ...current, items: current.items.filter((item) => item.id !== selectedItem.id) })); setSelectedItemId(null) }}>Xóa</button>
              </div>
            </div>
            <label><span>Kích thước <b>{Math.round(selectedItem.width * 100)}%</b></span><input type="range" min={.12} max={.95} step={.01} value={selectedItem.width} onChange={(event) => updateItem(selectedItem.id, { width: Number(event.target.value) })} /></label>
            <label><span>Xoay <b>{selectedItem.rotation}°</b></span><input type="range" min={-180} max={180} value={selectedItem.rotation} onChange={(event) => updateItem(selectedItem.id, { rotation: Number(event.target.value) })} /></label>
          </div>}
          <div className="decor-section-title"><h2>Khổ nền</h2><span>{output.width} × {output.height}</span></div>
          <div className="decor-format-grid">{COLLAGE_FORMATS.map((item) => <button type="button" className={collage.format === item.id ? 'selected' : ''} key={item.id} onClick={() => setCollage((current) => ({ ...current, format: item.id }))}>{item.label}</button>)}</div>
          <div className="decor-section-title"><h2>Màu & họa tiết</h2><input aria-label="Màu tùy chỉnh" type="color" value={collage.background} onChange={(event) => setCollage((current) => ({ ...current, background: event.target.value }))} /></div>
          <div className="decor-colors">{COLORS.map((color) => <button type="button" aria-label={color} className={collage.background === color ? 'selected' : ''} key={color} onClick={() => setCollage((current) => ({ ...current, background: color }))} style={{ background: color }} />)}</div>
          <div className="decor-format-grid">{(['solid', 'dots', 'grid'] as const).map((pattern) => <button type="button" className={collage.pattern === pattern ? 'selected' : ''} key={pattern} onClick={() => setCollage((current) => ({ ...current, pattern }))}>{pattern === 'solid' ? 'Trơn' : pattern === 'dots' ? 'Chấm' : 'Ô lưới'}</button>)}</div>
          <div className="decor-section-title"><h2>Nền ảnh</h2><button type="button" onClick={() => backgroundInputRef.current?.click()}>+ Thêm từ máy</button></div>
          <input ref={backgroundInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void addLocal(event)} />
          <div className="decor-backgrounds">
            <button type="button" className={!collage.backgroundImageUrl ? 'selected' : ''} onClick={() => setCollage((current) => ({ ...current, backgroundImageUrl: undefined }))}><span style={{ background: collage.background }} />Chỉ màu</button>
            {album.backgrounds.map((item) => <button type="button" className={collage.backgroundImageUrl === item.url ? 'selected' : ''} key={item.id} onClick={() => setCollage((current) => ({ ...current, backgroundImageUrl: item.url }))}><img alt="" src={item.url} />{item.name}</button>)}
            {localBackgrounds.map((item) => <div className="decor-local-background" key={item.id}><button type="button" className={collage.backgroundImageUrl === item.url ? 'selected' : ''} onClick={() => setCollage((current) => ({ ...current, backgroundImageUrl: item.url }))}><img alt="" src={item.url} />{item.name}</button><button type="button" aria-label={`Xóa ${item.name}`} onClick={() => void removeLocal(item)}>×</button></div>)}
          </div>
          <div className="decor-section-title"><h2>Xếp photobooth</h2><span>{collage.items.length}/{MAX_ITEMS}</span></div>
          <div className="decor-format-grid"><button type="button" onClick={chooseTwo}>Hai dải chéo</button><button type="button" disabled={collage.items.length >= MAX_ITEMS} onClick={addCopy}>Lặp thêm</button></div>
          <div className="decor-message-input"><label>Lời nhắn<input maxLength={80} value={collage.message} onChange={(event) => setCollage((current) => ({ ...current, message: event.target.value }))} placeholder="Nhập lời nhắn…" /></label><input aria-label="Màu chữ" type="color" value={collage.messageColor} onChange={(event) => setCollage((current) => ({ ...current, messageColor: event.target.value }))} /></div>
        </>}
        {notice && <p className="decor-notice" role="status">{notice}</p>}
      </aside>
    </div>
  </section>
}
