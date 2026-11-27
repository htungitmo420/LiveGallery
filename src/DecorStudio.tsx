import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ViewfinderCorners } from './components/Chrome'
import { CollageControls } from './components/decor/CollageControls'
import { CollageStage } from './components/decor/CollageStage'
import { StickerControls } from './components/decor/StickerControls'
import { StickerStage } from './components/decor/StickerStage'
import {
  FALLBACK_STICKERS,
  MAX_COLLAGE_ITEMS,
  MAX_STICKERS,
  downloadCanvas,
  duplicatePlacedSticker,
  preloadDecorImage,
  renderCollage,
  renderDecoratedStrip,
  type CollageItem,
  type CollageSettings,
  type DecorMode,
  type DecorStickerAsset,
  type PlacedSticker,
  type StickerCategory,
} from './decor'
import { readStoredDecor, writeStoredDecor } from './decor/storage'
import { localizeErrorMessage } from './i18n/core'
import { localizeStickerName } from './i18n/stickers'
import { useLocale } from './i18n/useLocale'
import type { GalleryAlbum } from './lib/gallery'
import {
  deleteLocalBackground,
  loadLocalBackgrounds,
  saveLocalBackground,
  type LocalBackground,
} from './lib/localBackgrounds'
import { SavePhotoModal, type ManualSaveState } from './SavePhotoModal'

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

interface Props {
  album: GalleryAlbum
  onClose: () => void
}

export function DecorStudio({ album, onClose }: Props) {
  const { locale, messages } = useLocale()
  const base = album.items.find((item) => item.fileName.startsWith('photobooth.'))
    ?? album.items.find((item) => item.kind === 'image')
  const initial = useMemo(() => readStoredDecor(album.shareCode), [album.shareCode])

  const [mode, setMode] = useState<DecorMode>('stickers')
  const [stickers, setStickers] = useState<PlacedSticker[]>(initial.stickers)
  const [stickerCategory, setStickerCategory] = useState<'all' | StickerCategory>('all')
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null)
  const [collage, setCollage] = useState<CollageSettings>(initial.collage)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(initial.collage.items[0]?.id ?? null)
  const [baseAspect, setBaseAspect] = useState(0.42)
  const [localBackgrounds, setLocalBackgrounds] = useState<LocalBackground[]>([])
  const [busy, setBusy] = useState(false)
  const [manualSave, setManualSave] = useState<ManualSaveState | null>(null)
  const [notice, setNotice] = useState('')
  const stickerClipboardRef = useRef<PlacedSticker | null>(null)

  const assets: DecorStickerAsset[] = useMemo(() => [
    ...album.stickers.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      kind: 'image' as const,
      content: item.url,
    })),
    ...FALLBACK_STICKERS.map((item) => ({
      ...item,
      name: localizeStickerName(item.id, item.name, locale),
    })),
  ], [album.stickers, locale])

  const visibleAssets = useMemo(
    () => assets.filter((item) => stickerCategory === 'all' || item.category === stickerCategory),
    [assets, stickerCategory],
  )
  const selectedSticker = stickers.find((item) => item.placementId === selectedStickerId) ?? null
  const selectedItem = collage.items.find((item) => item.id === selectedItemId) ?? null
  const topStickerZIndex = Math.max(0, ...stickers.map((item) => item.zIndex)) + 1

  useEffect(() => {
    let disposed = false
    let loaded: LocalBackground[] = []
    loadLocalBackgrounds()
      .then((items) => {
        loaded = items
        if (!disposed) setLocalBackgrounds(items)
        else items.forEach((item) => URL.revokeObjectURL(item.url))
      })
      .catch(() => undefined)
    return () => {
      disposed = true
      loaded.forEach((item) => URL.revokeObjectURL(item.url))
    }
  }, [])

  useEffect(() => {
    preloadDecorImage(base?.url)
    preloadDecorImage(collage.backgroundImageUrl)
    stickers.forEach((sticker) => {
      if (sticker.kind === 'image') preloadDecorImage(sticker.content)
    })
  }, [base?.url, collage.backgroundImageUrl, stickers])

  useEffect(() => {
    writeStoredDecor(album.shareCode, stickers, collage)
  }, [album.shareCode, collage, stickers])

  const duplicateSticker = useCallback(
    (source: PlacedSticker, noticeMessage = messages.decor.duplicatedStickerNotice) => {
      if (stickers.length >= MAX_STICKERS) {
        setNotice(messages.decor.maxStickersNotice(MAX_STICKERS))
        return
      }
      const placementId = makeId('sticker')
      const zIndex = Math.max(0, ...stickers.map((item) => item.zIndex)) + 1
      setStickers((current) => [...current, duplicatePlacedSticker(source, placementId, zIndex)])
      setSelectedStickerId(placementId)
      setNotice(noticeMessage)
    },
    [messages.decor, stickers],
  )

  const deleteSticker = useCallback((id: string) => {
    setStickers((current) => current.filter((item) => item.placementId !== id))
    setSelectedStickerId(null)
  }, [])

  useEffect(() => {
    if (mode !== 'stickers') return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      const shortcut = event.ctrlKey || event.metaKey

      if (shortcut && event.key.toLowerCase() === 'c' && selectedSticker) {
        event.preventDefault()
        stickerClipboardRef.current = { ...selectedSticker }
        setNotice(messages.decor.copiedStickerNotice)
        return
      }

      if (shortcut && event.key.toLowerCase() === 'v' && stickerClipboardRef.current) {
        event.preventDefault()
        duplicateSticker(stickerClipboardRef.current, messages.decor.pastedStickerNotice)
        return
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedStickerId) {
        event.preventDefault()
        deleteSticker(selectedStickerId)
        setNotice(messages.decor.deletedStickerNotice)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteSticker, duplicateSticker, messages.decor, mode, selectedSticker, selectedStickerId])

  if (!base) {
    return (
      <section className="decor-empty">
        <h2>{messages.decor.emptyTitle}</h2>
        <button className="primary-link" onClick={onClose} type="button">{messages.decor.backToAlbum}</button>
      </section>
    )
  }

  const addSticker = (asset: DecorStickerAsset) => {
    if (stickers.length >= MAX_STICKERS) return setNotice(messages.decor.maxStickersNotice(MAX_STICKERS))
    const next: PlacedSticker = {
      ...asset,
      placementId: makeId('sticker'),
      x: 0.5,
      y: 0.18 + Math.min(0.25, stickers.length * 0.035),
      size: 0.14,
      rotation: 0,
      zIndex: topStickerZIndex,
    }
    setStickers((current) => [...current, next])
    setSelectedStickerId(next.placementId)
  }

  const updateSticker = (id: string, changes: Partial<PlacedSticker>) => {
    setStickers((current) => current.map((item) => item.placementId === id ? { ...item, ...changes } : item))
  }

  const patchCollage = (changes: Partial<CollageSettings>) => {
    setCollage((current) => ({ ...current, ...changes }))
  }

  const updateItem = (id: string, changes: Partial<CollageItem>) => {
    setCollage((current) => ({
      ...current,
      items: current.items.map((item) => item.id === id ? { ...item, ...changes } : item),
    }))
  }

  const deleteSelectedItem = (id: string) => {
    setCollage((current) => ({ ...current, items: current.items.filter((item) => item.id !== id) }))
    setSelectedItemId(null)
  }

  const addCopy = () => {
    if (collage.items.length >= MAX_COLLAGE_ITEMS) return
    const source = selectedItem ?? collage.items.at(-1)!
    const topZ = Math.max(0, ...collage.items.map((item) => item.zIndex)) + 1
    const copy: CollageItem = {
      ...source,
      id: makeId('strip'),
      x: Math.min(1, source.x + 0.08),
      y: Math.min(1, source.y + 0.06),
      rotation: source.rotation + 4,
      zIndex: topZ,
    }
    setCollage((current) => ({ ...current, items: [...current.items, copy] }))
    setSelectedItemId(copy.id)
  }

  const chooseSingle = () => {
    const item: CollageItem = { id: makeId('strip'), x: 0.5, y: 0.5, width: 0.42, rotation: 0, zIndex: 1 }
    setCollage((current) => ({ ...current, items: [item] }))
    setSelectedItemId(item.id)
  }

  const chooseTwo = () => {
    const items: CollageItem[] = [
      { id: makeId('strip'), x: 0.34, y: 0.55, width: 0.42, rotation: -8, zIndex: 1 },
      { id: makeId('strip'), x: 0.68, y: 0.49, width: 0.42, rotation: 8, zIndex: 2 },
    ]
    setCollage((current) => ({ ...current, items }))
    setSelectedItemId(items[1].id)
  }

  const addLocal = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const item = await saveLocalBackground(file)
      setLocalBackgrounds((current) => [item, ...current])
      setCollage((current) => ({ ...current, backgroundImageUrl: item.url }))
      setNotice(messages.decor.savedLocalBgNotice)
    } catch (error) {
      setNotice(error instanceof Error ? localizeErrorMessage(error.message, locale) : messages.decor.addBgError)
    }
  }

  const removeLocal = async (item: LocalBackground) => {
    await deleteLocalBackground(item.id)
    setCollage((current) => current.backgroundImageUrl === item.url ? { ...current, backgroundImageUrl: undefined } : current)
    setLocalBackgrounds((current) => current.filter((candidate) => candidate.id !== item.id))
    URL.revokeObjectURL(item.url)
  }

  const exportDecor = async () => {
    setBusy(true)
    setNotice(messages.decor.creatingHighResNotice)
    try {
      const canvas = mode === 'background'
        ? await renderCollage(base.url, stickers, collage)
        : await renderDecoratedStrip(base.url, stickers)
      const outcome = await downloadCanvas(canvas, mode === 'background' ? 'livegallery-collage' : 'livegallery-sticker')
      if (outcome.status === 'manual' && outcome.previewUrl) {
        setManualSave({
          file: outcome.file,
          previewUrl: outcome.previewUrl,
          canRetryShare: outcome.canRetryShare,
        })
        setNotice(messages.decor.manualSaveNotice)
      } else if (outcome.status === 'shared') {
        setNotice(messages.decor.sharedNotice)
      } else if (outcome.status === 'cancelled') {
        setNotice('')
      } else {
        setNotice(messages.decor.downloadedNotice)
      }
    } catch (error) {
      setNotice(error instanceof Error ? localizeErrorMessage(error.message, locale) : messages.decor.exportError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="decor-studio">
      <div className="decor-studio__bar">
        <div className="decor-studio__title">
          <p className="decor-studio__code">#{album.shareCode.toUpperCase()} · {album.title}</p>
          <h1>{messages.decor.studioTitle}</h1>
        </div>
        <div className="decor-studio__actions">
          <button onClick={onClose} type="button">{messages.decor.back}</button>
          <button
            className="accent"
            disabled={busy}
            onClick={() => void exportDecor()}
            type="button"
          >
            {busy ? messages.decor.creating : (
              <>
                {messages.decor.savePhotoPrefix}
                {messages.decor.savePhotoDesktopSuffix && (
                  <span className="desktop-only">{messages.decor.savePhotoDesktopSuffix}</span>
                )}
              </>
            )}
          </button>
        </div>
      </div>

      <div className="decor-tabs" role="tablist" aria-label={messages.decor.modeTablistAria}>
        <button
          aria-selected={mode === 'stickers'}
          className={mode === 'stickers' ? 'selected' : ''}
          onClick={() => setMode('stickers')}
          role="tab"
          type="button"
        >
          {messages.decor.stickersTab(stickers.length)}
        </button>
        <button
          aria-selected={mode === 'background'}
          className={mode === 'background' ? 'selected' : ''}
          onClick={() => setMode('background')}
          role="tab"
          type="button"
        >
          {messages.decor.backgroundTab(collage.items.length)}
        </button>
      </div>

      <div className="decor-workspace">
        <div className="decor-preview">
          <ViewfinderCorners />

          {mode === 'stickers' ? (
            <StickerStage
              baseAspect={baseAspect}
              baseUrl={base.url}
              onBaseAspectLoad={setBaseAspect}
              onDeleteSticker={deleteSticker}
              onDuplicateSticker={duplicateSticker}
              onSelectSticker={setSelectedStickerId}
              onUpdateSticker={updateSticker}
              selectedSticker={selectedSticker}
              stickers={stickers}
              topStickerZIndex={topStickerZIndex}
            />
          ) : (
            <CollageStage
              baseAspect={baseAspect}
              baseUrl={base.url}
              collage={collage}
              onSelectItem={setSelectedItemId}
              onUpdateItem={updateItem}
              selectedItemId={selectedItemId}
              stickers={stickers}
            />
          )}
        </div>

        <aside className="decor-controls">
          {mode === 'stickers' ? (
            <StickerControls
              hasRemoteStickers={album.stickers.length > 0}
              onAddSticker={addSticker}
              onClearAll={() => {
                setStickers([])
                setSelectedStickerId(null)
              }}
              onClearSelection={() => setSelectedStickerId(null)}
              onDeleteSticker={deleteSticker}
              onDuplicateSticker={duplicateSticker}
              onSelectCategory={setStickerCategory}
              onUpdateSticker={updateSticker}
              selectedSticker={selectedSticker}
              stickerCategory={stickerCategory}
              stickersCount={stickers.length}
              visibleAssets={visibleAssets}
            />
          ) : (
            <CollageControls
              collage={collage}
              localBackgrounds={localBackgrounds}
              onAddCopy={addCopy}
              onAddLocalBackground={(event) => void addLocal(event)}
              onChooseSingle={chooseSingle}
              onChooseTwo={chooseTwo}
              onDeleteSelectedItem={deleteSelectedItem}
              onPatchCollage={patchCollage}
              onRemoveLocalBackground={(item) => void removeLocal(item)}
              onUpdateItem={updateItem}
              remoteBackgrounds={album.backgrounds}
              selectedItem={selectedItem}
            />
          )}
          {notice && <p className="decor-notice" role="status">{notice}</p>}
        </aside>
      </div>

      <SavePhotoModal
        item={manualSave}
        onClose={() => setManualSave(null)}
        onShared={() => setNotice(messages.viewer.sharedModalNotice)}
      />
    </section>
  )
}
