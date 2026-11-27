import {
  type ChangeEvent,
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ThemeMode } from '../hooks/useTheme'
import { localizeErrorMessage } from '../i18n/core'
import { useLocale } from '../i18n/useLocale'
import type { ManualSaveState } from '../SavePhotoModal'
import { fetchDiyCatalog } from '../lib/diy/catalog'
import { canvasToJpegBlob, composeDiyStrip } from '../lib/diy/compose'
import {
  DIY_FILTERS,
  DIY_LAYOUTS,
  FALLBACK_DIY_FRAMES,
  filterFramesForLayout,
  getDiyLayoutById,
} from '../lib/diy/geometry'
import type {
  DiyCatalog,
  DiyFilterId,
  DiyFrame,
  DiyLayoutId,
  DiyLocalPhoto,
} from '../lib/diy/types'
import { padFrame } from '../lib/format'
import {
  normalizeMediaFileName,
  saveMediaFileToDevice,
  type GalleryAlbum,
} from '../lib/gallery'
import { BrandLogo, Icon, LanguageSwitch, ThemeToggleButton, ViewfinderCorners } from './Chrome'

const loadDecorStudio = () => import('../DecorStudio').then((mod) => ({ default: mod.DecorStudio }))
const DecorStudio = lazy(loadDecorStudio)
const SavePhotoModal = lazy(() => import('../SavePhotoModal').then((mod) => ({ default: mod.SavePhotoModal })))

const MAX_STORED_PHOTOS = 4

function makePhotoId(): string {
  return `diy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i.test(file.name)
}

interface Props {
  theme: ThemeMode
  onToggleTheme: () => void
  onBackHome: () => void
}

export function DiyPhotoboothStudio({ theme, onToggleTheme, onBackHome }: Props) {
  const { locale, messages } = useLocale()
  const [catalog, setCatalog] = useState<DiyCatalog>({
    frames: [...FALLBACK_DIY_FRAMES],
    stickers: [],
    backgrounds: [],
    remote: false,
  })
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [layoutId, setLayoutId] = useState<DiyLayoutId>('strip4')
  const [selectedFrameId, setSelectedFrameId] = useState<string>('')
  const [filter, setFilter] = useState<DiyFilterId>('original')
  const [caption, setCaption] = useState('KHOẢNH KHẮC')
  const [showDate, setShowDate] = useState(true)
  const [photos, setPhotos] = useState<Array<DiyLocalPhoto | null>>([null, null, null, null])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [manualSave, setManualSave] = useState<ManualSaveState | null>(null)
  const [decorAlbum, setDecorAlbum] = useState<GalleryAlbum | null>(null)

  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const multiInputRef = useRef<HTMLInputElement>(null)
  const slotInputRef = useRef<HTMLInputElement>(null)
  const targetSlotRef = useRef<number>(0)
  const ownedUrlsRef = useRef<Set<string>>(new Set())
  const stripUrlRef = useRef<string | null>(null)

  const layout = useMemo(() => getDiyLayoutById(layoutId), [layoutId])
  const visibleFrames = useMemo(
    () => filterFramesForLayout(catalog.frames, layoutId),
    [catalog.frames, layoutId],
  )
  const activeFrame = useMemo(
    () => visibleFrames.find((frame) => frame.id === selectedFrameId) ?? visibleFrames[0],
    [selectedFrameId, visibleFrames],
  )
  const activeSlots = useMemo(
    () => Array.from({ length: layout.slots }, (_, index) => photos[index] ?? null),
    [layout.slots, photos],
  )
  const filledCount = activeSlots.filter(Boolean).length
  const missingCount = layout.slots - filledCount
  const isReady = missingCount === 0

  useEffect(() => {
    let active = true
    fetchDiyCatalog()
      .then((loaded) => {
        if (!active) return
        setCatalog(loaded)
        setLoadingCatalog(false)
      })
      .catch(() => {
        if (active) setLoadingCatalog(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const owned = ownedUrlsRef.current
    return () => {
      owned.forEach((url) => URL.revokeObjectURL(url))
      owned.clear()
      if (stripUrlRef.current) {
        URL.revokeObjectURL(stripUrlRef.current)
        stripUrlRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (decorAlbum) return
    let cancelled = false
    const photoUrls = activeSlots.map((slot) => slot?.url ?? null)

    composeDiyStrip({
      layout,
      frame: activeFrame,
      photoUrls,
      filter,
      caption,
      showDate,
      locale,
      scale: 0.44,
    })
      .then((rendered) => {
        if (cancelled) return
        const target = previewCanvasRef.current
        if (!target) return
        target.width = rendered.width
        target.height = rendered.height
        const context = target.getContext('2d')
        if (!context) return
        context.clearRect(0, 0, target.width, target.height)
        context.drawImage(rendered, 0, 0)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [activeFrame, activeSlots, caption, decorAlbum, filter, layout, locale, showDate])

  const getFrameLabel = (frame: DiyFrame) =>
    frame.source === 'builtin' ? (messages.diy.builtinFrames[frame.id] ?? frame.name) : frame.name

  const registerPhotoUrl = (file: File): DiyLocalPhoto => {
    const url = URL.createObjectURL(file)
    ownedUrlsRef.current.add(url)
    return { id: makePhotoId(), url, name: file.name }
  }

  const revokePhotoUrl = (photo: DiyLocalPhoto | null) => {
    if (!photo) return
    if (ownedUrlsRef.current.has(photo.url)) {
      URL.revokeObjectURL(photo.url)
      ownedUrlsRef.current.delete(photo.url)
    }
  }

  const handleMultiFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (rawFiles.length === 0) return

    const validFiles = rawFiles.filter(isImageFile)
    if (validFiles.length < rawFiles.length) {
      setNotice(messages.diy.invalidFileNotice)
    } else {
      setNotice('')
    }
    if (validFiles.length === 0) return

    setPhotos((current) => {
      const next = [...current]
      while (next.length < MAX_STORED_PHOTOS) next.push(null)

      const emptyIndices: number[] = []
      for (let i = 0; i < layout.slots; i += 1) {
        if (!next[i]) emptyIndices.push(i)
      }

      if (emptyIndices.length > 0 && validFiles.length <= emptyIndices.length) {
        validFiles.forEach((file, offset) => {
          const slotIndex = emptyIndices[offset]
          next[slotIndex] = registerPhotoUrl(file)
        })
      } else {
        // Fill from slot 0 up to layout.slots, replacing existing photos cleanly
        validFiles.slice(0, layout.slots).forEach((file, index) => {
          revokePhotoUrl(next[index])
          next[index] = registerPhotoUrl(file)
        })
      }
      return next
    })
  }

  const handleSingleSlotChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!isImageFile(file)) {
      setNotice(messages.diy.invalidFileNotice)
      return
    }
    setNotice('')
    const slotIndex = targetSlotRef.current
    setPhotos((current) => {
      const next = [...current]
      while (next.length < MAX_STORED_PHOTOS) next.push(null)
      revokePhotoUrl(next[slotIndex])
      next[slotIndex] = registerPhotoUrl(file)
      return next
    })
  }

  const openSlotPicker = (index: number) => {
    targetSlotRef.current = index
    slotInputRef.current?.click()
  }

  const removeSlot = (index: number) => {
    setPhotos((current) => {
      const next = [...current]
      revokePhotoUrl(next[index] ?? null)
      next[index] = null
      return next
    })
  }

  const swapSlots = (from: number, to: number) => {
    if (to < 0 || to >= layout.slots) return
    setPhotos((current) => {
      const next = [...current]
      const temp = next[from] ?? null
      next[from] = next[to] ?? null
      next[to] = temp
      return next
    })
  }

  const clearAllPhotos = () => {
    setPhotos((current) => {
      current.forEach(revokePhotoUrl)
      return [null, null, null, null]
    })
    setNotice('')
  }

  const renderFinalStripBlob = async (): Promise<{ blob: Blob; width: number; height: number }> => {
    const rendered = await composeDiyStrip({
      layout,
      frame: activeFrame,
      photoUrls: activeSlots.map((slot) => slot?.url ?? null),
      filter,
      caption,
      showDate,
      locale,
      scale: 1,
    })
    const blob = await canvasToJpegBlob(rendered, 0.96)
    return { blob, width: rendered.width, height: rendered.height }
  }

  const handleOpenDecor = async () => {
    if (!isReady || busy) return
    setBusy(true)
    setNotice('')
    try {
      const { blob, width, height } = await renderFinalStripBlob()
      if (stripUrlRef.current) URL.revokeObjectURL(stripUrlRef.current)
      const stripUrl = URL.createObjectURL(blob)
      stripUrlRef.current = stripUrl
      setDecorAlbum({
        shareCode: 'diy-studio',
        title: messages.diy.syntheticAlbumTitle,
        message: null,
        createdAt: new Date().toISOString(),
        expiresAt: null,
        items: [
          {
            id: 'diy-strip',
            kind: 'image',
            url: stripUrl,
            thumbnailUrl: stripUrl,
            mimeType: 'image/jpeg',
            fileName: 'photobooth.jpg',
            width,
            height,
            durationMs: null,
            sortOrder: 0,
          },
        ],
        stickers: catalog.stickers,
        backgrounds: catalog.backgrounds,
      })
    } catch (error) {
      setNotice(error instanceof Error ? localizeErrorMessage(error.message, locale) : messages.diy.renderError)
    } finally {
      setBusy(false)
    }
  }

  const handleSaveDirectly = async () => {
    if (!isReady || busy) return
    setBusy(true)
    setNotice('')
    try {
      const { blob } = await renderFinalStripBlob()
      const fileName = normalizeMediaFileName(`photobooth-${Date.now()}`, 'image/jpeg', 'photobooth')
      const file = new File([blob], fileName, { type: 'image/jpeg', lastModified: Date.now() })
      const outcome = await saveMediaFileToDevice(file)
      if (outcome.status === 'manual' && outcome.previewUrl) {
        setManualSave({
          file: outcome.file,
          previewUrl: outcome.previewUrl,
          canRetryShare: outcome.canRetryShare,
        })
        setNotice(messages.diy.manualSaveNotice)
      } else if (outcome.status === 'shared') {
        setNotice(messages.diy.sharedNotice)
      } else if (outcome.status === 'downloaded') {
        setNotice(messages.diy.downloadedNotice)
      }
    } catch (error) {
      setNotice(error instanceof Error ? localizeErrorMessage(error.message, locale) : messages.diy.renderError)
    } finally {
      setBusy(false)
    }
  }

  if (decorAlbum) {
    return (
      <div className="gallery gallery--decorating">
        <header className="gallery__header">
          <BrandLogo compact />
          <div className="gallery__actions">
            <LanguageSwitch compact />
            <ThemeToggleButton compact onToggle={onToggleTheme} theme={theme} />
            <button className="icon-button" onClick={() => setDecorAlbum(null)} type="button">
              <Icon name="arrow-left" size={17} />
              <span>{messages.diy.backToCompose}</span>
            </button>
          </div>
        </header>
        <main className="gallery__decor-main">
          <Suspense
            fallback={(
              <div className="status-card" style={{ margin: '48px auto' }}>
                <div className="film-loader" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <h1>{messages.viewer.openingDecor}</h1>
              </div>
            )}
          >
            <DecorStudio album={decorAlbum} onClose={() => setDecorAlbum(null)} />
          </Suspense>
        </main>
      </div>
    )
  }

  return (
    <div className="gallery diy-shell">
      <header className="gallery__header">
        <div className="gallery__brand-group">
          <BrandLogo compact />
          <span className="gallery__header-code">{messages.diy.studioTag}</span>
        </div>

        <div className="gallery__actions">
          <LanguageSwitch compact />
          <ThemeToggleButton compact onToggle={onToggleTheme} theme={theme} />
          <button
            className="icon-button"
            onClick={onBackHome}
            type="button"
          >
            <Icon name="arrow-left" size={17} />
            <span className="icon-button__text">{messages.diy.backHome}</span>
          </button>
        </div>
      </header>

      <main className="diy-studio">
        <div className="diy-studio__bar">
          <div className="diy-studio__title">
            <p className="diy-studio__code">{messages.diy.studioTag}</p>
            <h1>{messages.diy.studioTitle}</h1>
          </div>
          <div className="diy-studio__actions">
            <button
              className="diy-action-btn"
              disabled={!isReady || busy}
              onClick={() => void handleSaveDirectly()}
              type="button"
            >
              <Icon name="download" size={16} />
              <span>{busy ? messages.diy.renderingLabel : messages.diy.saveAction}</span>
            </button>
            <button
              className="diy-action-btn diy-action-btn--accent"
              disabled={!isReady || busy}
              onClick={() => void handleOpenDecor()}
              onFocus={() => void loadDecorStudio()}
              onPointerEnter={() => void loadDecorStudio()}
              type="button"
            >
              <Icon name="decor" size={16} />
              <span>{busy ? messages.diy.renderingLabel : messages.diy.decorateAction}</span>
            </button>
          </div>
        </div>

        <div className="diy-workspace">
          <section aria-label={messages.diy.previewAria} className="diy-preview">
            <ViewfinderCorners />
            <canvas
              aria-label={messages.diy.previewAria}
              className="diy-preview__canvas"
              ref={previewCanvasRef}
            />
          </section>

          <aside className="diy-controls">
            {/* Step 1: Layout */}
            <div className="decor-section-title">
              <span>{messages.diy.stepLayoutTitle}</span>
              <span>{messages.diy.layouts[layoutId].slotsLabel}</span>
            </div>
            <div className="diy-layout-grid">
              {DIY_LAYOUTS.map((item) => (
                <button
                  aria-pressed={layoutId === item.id}
                  className={layoutId === item.id ? 'selected' : ''}
                  key={item.id}
                  onClick={() => setLayoutId(item.id)}
                  type="button"
                >
                  <strong>{messages.diy.layouts[item.id].name}</strong>
                  <small>{messages.diy.layouts[item.id].slotsLabel}</small>
                </button>
              ))}
            </div>

            {/* Step 2: Photos from phone */}
            <div className="decor-section-title">
              <span>{messages.diy.stepPhotosTitle(filledCount, layout.slots)}</span>
              {filledCount > 0 && (
                <button
                  className="decor-clear-button"
                  onClick={clearAllPhotos}
                  type="button"
                >
                  {messages.diy.clearPhotos}
                </button>
              )}
            </div>

            <input
              accept="image/*"
              className="sr-only"
              multiple
              onChange={handleMultiFileChange}
              ref={multiInputRef}
              type="file"
            />
            <input
              accept="image/*"
              className="sr-only"
              onChange={handleSingleSlotChange}
              ref={slotInputRef}
              type="file"
            />

            <button
              className="diy-upload-button"
              onClick={() => multiInputRef.current?.click()}
              type="button"
            >
              <Icon name="image" size={17} />
              <span>{messages.diy.pickPhotosAction(filledCount, layout.slots)}</span>
            </button>

            <div className="diy-slot-grid">
              {activeSlots.map((photo, index) => {
                const frameNum = padFrame(index + 1)
                return (
                  <div className={photo ? 'diy-slot diy-slot--filled' : 'diy-slot'} key={index}>
                    <button
                      aria-label={messages.diy.replaceSlotAria(frameNum)}
                      className="diy-slot__trigger"
                      onClick={() => openSlotPicker(index)}
                      type="button"
                    >
                      {photo ? (
                        <img alt={photo.name} src={photo.url} />
                      ) : (
                        <span className="diy-slot__empty">
                          <strong>+</strong>
                          <small>{messages.diy.emptySlotLabel(frameNum)}</small>
                        </span>
                      )}
                      <span className="diy-slot__num" aria-hidden="true">{frameNum}</span>
                    </button>
                    {photo && (
                      <div className="diy-slot__controls">
                        {index > 0 && (
                          <button
                            aria-label={messages.diy.moveLeftAria(frameNum)}
                            onClick={() => swapSlots(index, index - 1)}
                            type="button"
                          >
                            ‹
                          </button>
                        )}
                        {index < layout.slots - 1 && (
                          <button
                            aria-label={messages.diy.moveRightAria(frameNum)}
                            onClick={() => swapSlots(index, index + 1)}
                            type="button"
                          >
                            ›
                          </button>
                        )}
                        <button
                          aria-label={messages.diy.removeSlotAria(frameNum)}
                          className="diy-slot__remove"
                          onClick={() => removeSlot(index)}
                          type="button"
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Step 3: Frames from photobooth_frames */}
            <div className="decor-section-title">
              <span>{messages.diy.stepFramesTitle}</span>
              <span>
                {loadingCatalog
                  ? messages.diy.loadingFrames
                  : catalog.remote
                    ? messages.diy.framesRemoteTag
                    : messages.diy.framesBuiltinTag}
              </span>
            </div>

            <div className="diy-frame-grid">
              {visibleFrames.map((frame) => {
                const isSelected = activeFrame.id === frame.id
                const label = getFrameLabel(frame)
                return (
                  <button
                    aria-pressed={isSelected}
                    className={isSelected ? 'diy-frame-option selected' : 'diy-frame-option'}
                    key={frame.id}
                    onClick={() => setSelectedFrameId(frame.id)}
                    type="button"
                  >
                    <span
                      className="diy-frame-option__swatch"
                      style={frame.assetUrl ? undefined : {
                        background: frame.config.background,
                        borderColor: frame.config.accent,
                      }}
                    >
                      {frame.assetUrl ? (
                        <img
                          alt=""
                          crossOrigin="anonymous"
                          decoding="async"
                          loading="lazy"
                          src={frame.assetUrl}
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="diy-frame-option__mock"
                          style={{ borderColor: frame.config.accent }}
                        />
                      )}
                    </span>
                    <span className="diy-frame-option__name">{label}</span>
                  </button>
                )
              })}
            </div>

            {/* Step 4: Color filter */}
            <div className="decor-section-title">
              <span>{messages.diy.stepFilterTitle}</span>
              <span>{messages.diy.filters[filter]}</span>
            </div>
            <div className="diy-filter-row">
              {DIY_FILTERS.map((item) => (
                <button
                  aria-pressed={filter === item.id}
                  className={filter === item.id ? 'selected' : ''}
                  key={item.id}
                  onClick={() => setFilter(item.id)}
                  type="button"
                >
                  {messages.diy.filters[item.id]}
                </button>
              ))}
            </div>

            {/* Optional caption & date for built-in frames */}
            {!activeFrame.assetUrl && (
              <div className="diy-caption-box">
                <label className="diy-caption-field">
                  <span>{messages.diy.captionLabel}</span>
                  <input
                    maxLength={60}
                    onChange={(event) => setCaption(event.target.value)}
                    placeholder={messages.diy.captionPlaceholder}
                    type="text"
                    value={caption}
                  />
                </label>
                <label className="diy-date-toggle">
                  <input
                    checked={showDate}
                    onChange={(event) => setShowDate(event.target.checked)}
                    type="checkbox"
                  />
                  <span>{messages.diy.showDateLabel}</span>
                </label>
              </div>
            )}

            <p className={isReady ? 'diy-status-hint diy-status-hint--ready' : 'diy-status-hint'}>
              {isReady
                ? messages.diy.readyHint
                : messages.diy.needMorePhotosHint(missingCount, layout.slots)}
            </p>

            {notice && <p className="decor-notice" role="status">{notice}</p>}
          </aside>
        </div>
      </main>

      {manualSave && (
        <Suspense fallback={null}>
          <SavePhotoModal
            item={manualSave}
            onClose={() => setManualSave(null)}
            onShared={() => setNotice(messages.viewer.sharedModalNotice)}
          />
        </Suspense>
      )}
    </div>
  )
}
