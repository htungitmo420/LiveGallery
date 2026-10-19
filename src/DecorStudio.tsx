import { useEffect, useMemo, useRef, useState } from 'react'
import {
  COLLAGE_FORMATS,
  DEFAULT_COLLAGE,
  FALLBACK_STICKERS,
  collageSize,
  downloadCanvas,
  renderCollage,
  renderDecoratedStrip,
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
    >{sticker.kind === 'image' ? <img alt="" draggable={false} src={sticker.content} /> : sticker.content}</span>)}
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

  const assets: DecorStickerAsset[] = useMemo(() => [
    ...album.stickers.map((item) => ({ id: item.id, name: item.name, kind: 'image' as const, content: item.url })),
    ...FALLBACK_STICKERS,
  ], [album.stickers])
  const selectedSticker = stickers.find((item) => item.placementId === selectedStickerId) ?? null
  const selectedItem = collage.items.find((item) => item.id === selectedItemId) ?? null
  const output = collageSize(collage.format)

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
      zIndex: stickers.length + 1,
    }
    setStickers((current) => [...current, next])
    setSelectedStickerId(next.placementId)
  }

  const updateSticker = (id: string, changes: Partial<PlacedSticker>) => {
    setStickers((current) => current.map((item) => item.placementId === id ? { ...item, ...changes } : item))
  }

  const startStickerMove = (event: React.PointerEvent<HTMLButtonElement>, sticker: PlacedSticker) => {
    const stage = stickerStageRef.current
    if (!stage) return
    event.preventDefault()
    setSelectedStickerId(sticker.placementId)
    const rect = stage.getBoundingClientRect()
    const move = (next: PointerEvent) => updateSticker(sticker.placementId, {
      x: Math.min(1.1, Math.max(-.1, (next.clientX - rect.left) / rect.width)),
      y: Math.min(1.1, Math.max(-.1, (next.clientY - rect.top) / rect.height)),
    })
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
  }

  const updateItem = (id: string, changes: Partial<CollageItem>) => {
    setCollage((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, ...changes } : item) }))
  }

  const startItemMove = (event: React.PointerEvent<HTMLButtonElement>, item: CollageItem) => {
    const stage = collageStageRef.current
    if (!stage) return
    event.preventDefault()
    setSelectedItemId(item.id)
    const rect = stage.getBoundingClientRect()
    const move = (next: PointerEvent) => updateItem(item.id, {
      x: Math.min(1.12, Math.max(-.12, (next.clientX - rect.left) / rect.width)),
      y: Math.min(1.12, Math.max(-.12, (next.clientY - rect.top) / rect.height)),
    })
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
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
      <div><p className="eyebrow">TRANG TRÍ SAU KHI CHỤP</p><h1>Thêm dấu ấn của bạn</h1></div>
      <div className="decor-studio__actions"><button onClick={onClose}>Quay lại album</button><button className="accent" disabled={busy} onClick={() => void exportDecor()}>{busy ? 'Đang tạo…' : 'Tải ảnh hoàn chỉnh'}</button></div>
    </div>
    <div className="decor-tabs" role="tablist">
      <button className={mode === 'stickers' ? 'selected' : ''} onClick={() => setMode('stickers')}>Sticker ({stickers.length})</button>
      <button className={mode === 'background' ? 'selected' : ''} onClick={() => setMode('background')}>Nền ghép ({collage.items.length})</button>
    </div>
    <div className="decor-workspace">
      <div className="decor-preview">
        {mode === 'stickers' ? <div className="decor-strip-stage" ref={stickerStageRef} style={{ aspectRatio: baseAspect }}>
          <img alt="Ảnh photobooth" draggable={false} src={base.url} onLoad={(event) => setBaseAspect(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} />
          {stickers.slice().sort((a, b) => a.zIndex - b.zIndex).map((sticker) => <button
            aria-label={`Di chuyển ${sticker.name}`}
            className={selectedStickerId === sticker.placementId ? 'decor-sticker selected' : 'decor-sticker'}
            key={sticker.placementId}
            onClick={() => setSelectedStickerId(sticker.placementId)}
            onPointerDown={(event) => startStickerMove(event, sticker)}
            style={{ left: `${sticker.x * 100}%`, top: `${sticker.y * 100}%`, width: `${sticker.size * 100}%`, transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg)`, zIndex: sticker.zIndex }}
          >{sticker.kind === 'image' ? <img alt="" draggable={false} src={sticker.content} /> : sticker.content}</button>)}
        </div> : <div
          className="decor-collage-stage"
          ref={collageStageRef}
          style={{
            aspectRatio: `${output.width}/${output.height}`,
            backgroundColor: collage.background,
            backgroundImage: backgroundLayers.length ? backgroundLayers.join(',') : undefined,
            backgroundSize: `${patternLayers.map(() => '24px 24px').join(',')}${patternLayers.length && collage.backgroundImageUrl ? ',' : ''}${collage.backgroundImageUrl ? 'cover' : ''}` || undefined,
            backgroundPosition: collage.backgroundImageUrl ? '0 0,0 0,center' : undefined,
          }}
        >
          {collage.items.slice().sort((a, b) => a.zIndex - b.zIndex).map((item) => <button
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
          <div className="decor-section-title"><h2>Chọn sticker</h2><span>{album.stickers.length ? 'Supabase + có sẵn' : 'Có sẵn'}</span></div>
          <div className="decor-sticker-library">{assets.map((asset) => <button key={asset.id} onClick={() => addSticker(asset)} title={asset.name}>{asset.kind === 'image' ? <img alt={asset.name} src={asset.content} /> : <span>{asset.content}</span>}</button>)}</div>
          {selectedSticker && <div className="decor-sliders">
            <label>Kích thước <input type="range" min={.05} max={.4} step={.01} value={selectedSticker.size} onChange={(event) => updateSticker(selectedSticker.placementId, { size: Number(event.target.value) })} /></label>
            <label>Xoay <input type="range" min={-180} max={180} value={selectedSticker.rotation} onChange={(event) => updateSticker(selectedSticker.placementId, { rotation: Number(event.target.value) })} /></label>
            <button className="danger" onClick={() => { setStickers((current) => current.filter((item) => item.placementId !== selectedSticker.placementId)); setSelectedStickerId(null) }}>Xóa sticker</button>
          </div>}
          <p className="decor-help">Kéo sticker trực tiếp trên ảnh, rồi chỉnh kích thước hoặc góc xoay.</p>
        </> : <>
          <div className="decor-section-title"><h2>Khổ nền</h2><span>{output.width} × {output.height}</span></div>
          <div className="decor-format-grid">{COLLAGE_FORMATS.map((item) => <button className={collage.format === item.id ? 'selected' : ''} key={item.id} onClick={() => setCollage((current) => ({ ...current, format: item.id }))}>{item.label}</button>)}</div>
          <div className="decor-section-title"><h2>Màu & họa tiết</h2><input aria-label="Màu tùy chỉnh" type="color" value={collage.background} onChange={(event) => setCollage((current) => ({ ...current, background: event.target.value }))} /></div>
          <div className="decor-colors">{COLORS.map((color) => <button aria-label={color} className={collage.background === color ? 'selected' : ''} key={color} onClick={() => setCollage((current) => ({ ...current, background: color }))} style={{ background: color }} />)}</div>
          <div className="decor-format-grid">{(['solid', 'dots', 'grid'] as const).map((pattern) => <button className={collage.pattern === pattern ? 'selected' : ''} key={pattern} onClick={() => setCollage((current) => ({ ...current, pattern }))}>{pattern === 'solid' ? 'Trơn' : pattern === 'dots' ? 'Chấm' : 'Ô lưới'}</button>)}</div>
          <div className="decor-section-title"><h2>Nền ảnh</h2><button onClick={() => backgroundInputRef.current?.click()}>+ Thêm từ máy</button></div>
          <input ref={backgroundInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void addLocal(event)} />
          <div className="decor-backgrounds">
            <button className={!collage.backgroundImageUrl ? 'selected' : ''} onClick={() => setCollage((current) => ({ ...current, backgroundImageUrl: undefined }))}><span style={{ background: collage.background }} />Chỉ màu</button>
            {album.backgrounds.map((item) => <button className={collage.backgroundImageUrl === item.url ? 'selected' : ''} key={item.id} onClick={() => setCollage((current) => ({ ...current, backgroundImageUrl: item.url }))}><img alt="" src={item.url} />{item.name}</button>)}
            {localBackgrounds.map((item) => <div className="decor-local-background" key={item.id}><button className={collage.backgroundImageUrl === item.url ? 'selected' : ''} onClick={() => setCollage((current) => ({ ...current, backgroundImageUrl: item.url }))}><img alt="" src={item.url} />{item.name}</button><button aria-label={`Xóa ${item.name}`} onClick={() => void removeLocal(item)}>×</button></div>)}
          </div>
          <div className="decor-section-title"><h2>Xếp photobooth</h2><span>{collage.items.length}/{MAX_ITEMS}</span></div>
          <div className="decor-format-grid"><button onClick={chooseTwo}>Hai dải chéo</button><button disabled={collage.items.length >= MAX_ITEMS} onClick={addCopy}>Lặp thêm</button></div>
          {selectedItem && <div className="decor-sliders">
            <label>Kích thước <input type="range" min={.12} max={.95} step={.01} value={selectedItem.width} onChange={(event) => updateItem(selectedItem.id, { width: Number(event.target.value) })} /></label>
            <label>Xoay <input type="range" min={-180} max={180} value={selectedItem.rotation} onChange={(event) => updateItem(selectedItem.id, { rotation: Number(event.target.value) })} /></label>
            <button className="danger" disabled={collage.items.length <= 1} onClick={() => { setCollage((current) => ({ ...current, items: current.items.filter((item) => item.id !== selectedItem.id) })); setSelectedItemId(null) }}>Xóa bản đang chọn</button>
          </div>}
          <div className="decor-message-input"><label>Lời nhắn<input maxLength={80} value={collage.message} onChange={(event) => setCollage((current) => ({ ...current, message: event.target.value }))} placeholder="Nhập lời nhắn…" /></label><input aria-label="Màu chữ" type="color" value={collage.messageColor} onChange={(event) => setCollage((current) => ({ ...current, messageColor: event.target.value }))} /></div>
        </>}
        {notice && <p className="decor-notice" role="status">{notice}</p>}
      </aside>
    </div>
  </section>
}
