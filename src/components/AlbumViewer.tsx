import {
  type PointerEvent as ReactPointerEvent,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { ThemeMode } from '../hooks/useTheme'
import { localizeErrorMessage } from '../i18n/core'
import { useLocale } from '../i18n/useLocale'
import type { ManualSaveState } from '../SavePhotoModal'
import { formatAlbumDate, padFrame } from '../lib/format'
import {
  buildAlbumPath,
  downloadAllGalleryMedia,
  downloadGalleryMedia,
  preloadGalleryMedia,
  saveMediaFileToDevice,
  type GalleryAlbum,
  type GalleryMedia,
  type SaveAllMediaOutcome,
  type SaveMediaOutcome,
} from '../lib/gallery'
import { recordRecentAlbum } from '../lib/recentAlbums'
import { exportStoryVideoFile } from '../lib/storyVideoExport'
import { BrandLogo, Icon, LanguageSwitch, ThemeToggleButton, ViewfinderCorners } from './Chrome'
import type { SaveAllModalState } from './SaveAllModal'

const loadDecorStudio = () => import('../DecorStudio').then((mod) => ({ default: mod.DecorStudio }))
const DecorStudio = lazy(loadDecorStudio)
const SavePhotoModal = lazy(() => import('../SavePhotoModal').then((mod) => ({ default: mod.SavePhotoModal })))
const SaveAllModal = lazy(() => import('./SaveAllModal').then((mod) => ({ default: mod.SaveAllModal })))
const AlbumQrModal = lazy(() => import('./AlbumQrModal').then((mod) => ({ default: mod.AlbumQrModal })))

function MediaView({
  item,
  albumTitle,
  onError,
  onLoad,
}: {
  item: GalleryMedia
  albumTitle: string
  onError: () => void
  onLoad: () => void
}) {
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const el = imgRef.current
    if (el && el.complete && el.naturalWidth > 0) {
      onLoad()
    }
  }, [item.url, onLoad])

  if (item.kind === 'video') {
    return (
      <video
        aria-label={`${albumTitle} - ${item.fileName}`}
        autoPlay
        className="viewer__media viewer__media--video"
        controls
        crossOrigin="anonymous"
        loop
        muted
        onError={onError}
        onLoadedData={onLoad}
        playsInline
        preload="metadata"
        src={item.url}
      />
    )
  }

  return (
    <img
      alt={`${albumTitle} - ${item.fileName}`}
      className="viewer__media"
      crossOrigin="anonymous"
      decoding="async"
      draggable={false}
      fetchPriority="high"
      height={item.height ?? undefined}
      onError={onError}
      onLoad={onLoad}
      ref={imgRef}
      src={item.url}
      width={item.width ?? undefined}
    />
  )
}

export function AlbumViewer({
  album,
  onRefresh,
  theme,
  onToggleTheme,
}: {
  album: GalleryAlbum
  onRefresh: () => Promise<GalleryAlbum>
  theme: ThemeMode
  onToggleTheme: () => void
}) {
  const { locale, messages } = useLocale()
  const [activeIndex, setActiveIndex] = useState(0)
  const [loadedAlbumCode, setLoadedAlbumCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [decorating, setDecorating] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const [exportingStory, setExportingStory] = useState(false)
  const [saveAllProgress, setSaveAllProgress] = useState<{ done: number; total: number } | null>(null)
  const [manualSave, setManualSave] = useState<ManualSaveState | null>(null)
  const [saveAllModal, setSaveAllModal] = useState<SaveAllModalState | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const viewerRef = useRef<HTMLDivElement>(null)
  const pointerStart = useRef<number | null>(null)
  const refreshedBrokenMedia = useRef(false)
  const current = album.items[activeIndex]
  const movingVideo = album.items.find((item) => item.kind === 'video')
  const heroLoaded = loadedAlbumCode === album.shareCode
  const albumShareUrl = `${window.location.origin}${buildAlbumPath(album.shareCode)}${locale === 'vi' ? '' : `?lang=${locale}`}`

  useEffect(() => {
    recordRecentAlbum(album)
  }, [album])

  // Wait until the hero image finishes painting before warming the download cache or idle-prefetching DecorStudio,
  // so nothing competes with the hero image for bandwidth on 4G connections.
  useEffect(() => {
    if (!heroLoaded) return
    preloadGalleryMedia(current)
  }, [current, heroLoaded])

  useEffect(() => {
    if (!heroLoaded) return
    const timer = window.setTimeout(() => {
      void loadDecorStudio()
    }, 600)
    return () => window.clearTimeout(timer)
  }, [heroLoaded])

  const handleHeroLoad = useCallback(() => {
    refreshedBrokenMedia.current = false
    setLoadedAlbumCode(album.shareCode)
  }, [album.shareCode])

  const move = useCallback(
    (direction: -1 | 1) => {
      if (album.items.length < 2) return
      setActiveIndex((index) => (index + direction + album.items.length) % album.items.length)
    },
    [album.items.length],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (decorating || manualSave || saveAllModal || qrOpen) return
      if (event.key === 'ArrowLeft') move(-1)
      if (event.key === 'ArrowRight') move(1)
      if (event.key === 'Home') setActiveIndex(0)
      if (event.key === 'End') setActiveIndex(album.items.length - 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [album.items.length, decorating, manualSave, move, qrOpen, saveAllModal])

  const enterFullscreen = async () => {
    if (!viewerRef.current) return
    try {
      await viewerRef.current.requestFullscreen()
    } catch {
      /* Fullscreen may be unavailable. */
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(albumShareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  const applySaveOutcome = (outcome: SaveMediaOutcome) => {
    if (outcome.status === 'manual' && outcome.previewUrl) {
      setManualSave({
        file: outcome.file,
        previewUrl: outcome.previewUrl,
        canRetryShare: outcome.canRetryShare,
      })
      return
    }
    if (outcome.status === 'shared') {
      setNotice(messages.viewer.sharedNotice)
    }
  }

  const applySaveAllOutcome = (outcome: SaveAllMediaOutcome) => {
    if (outcome.status === 'ready-to-share' || outcome.status === 'manual') {
      setSaveAllModal({
        mode: outcome.status,
        files: outcome.files,
        skippedCount: outcome.skippedCount,
      })
      return
    }
    if (outcome.status === 'shared') {
      setNotice(
        outcome.skippedCount > 0
          ? messages.viewer.saveAllSharedPartialNotice(outcome.files.length, outcome.skippedCount)
          : messages.viewer.saveAllSharedNotice(outcome.files.length),
      )
      return
    }
    if (outcome.status === 'downloaded') {
      setNotice(messages.viewer.saveAllDownloadedNotice(outcome.files.length))
    }
  }

  const downloadCurrent = async () => {
    if (!current || downloading || savingAll) return
    setDownloading(true)
    setNotice('')
    try {
      const outcome = await downloadGalleryMedia(current)
      applySaveOutcome(outcome)
    } catch {
      try {
        const fresh = await onRefresh()
        const replacement = fresh.items.find((item) => item.id === current.id)
        if (!replacement) throw new Error(messages.viewer.missingPhotoError)
        const outcome = await downloadGalleryMedia(replacement, { bypassCache: true })
        applySaveOutcome(outcome)
      } catch (error) {
        setNotice(error instanceof Error ? localizeErrorMessage(error.message, locale) : messages.viewer.downloadError)
      }
    } finally {
      setDownloading(false)
    }
  }

  const saveAllPhotos = async () => {
    if (album.items.length === 0 || savingAll || downloading || exportingStory) return
    setSavingAll(true)
    setSaveAllProgress({ done: 0, total: album.items.length })
    setNotice('')
    const onProgress = (done: number, total: number) => {
      setSaveAllProgress({ done, total })
    }
    try {
      const outcome = await downloadAllGalleryMedia(album.items, { onProgress })
      applySaveAllOutcome(outcome)
    } catch {
      try {
        const fresh = await onRefresh()
        if (fresh.items.length === 0) throw new Error(messages.viewer.missingPhotoError)
        const outcome = await downloadAllGalleryMedia(fresh.items, {
          bypassCache: true,
          onProgress,
        })
        applySaveAllOutcome(outcome)
      } catch (error) {
        setNotice(error instanceof Error ? localizeErrorMessage(error.message, locale) : messages.viewer.saveAllError)
      }
    } finally {
      setSavingAll(false)
      setSaveAllProgress(null)
    }
  }

  const exportStoryVideo = async () => {
    if (!movingVideo || exportingStory || savingAll || downloading) return
    setExportingStory(true)
    setNotice('')
    const runExport = async (target: GalleryMedia) => {
      const storyFile = await exportStoryVideoFile(target, album.title)
      const outcome = await saveMediaFileToDevice(storyFile)
      if (outcome.status === 'manual' && outcome.previewUrl) {
        setManualSave({
          file: outcome.file,
          previewUrl: outcome.previewUrl,
          canRetryShare: outcome.canRetryShare,
        })
      } else if (outcome.status === 'shared') {
        setNotice(messages.viewer.storySharedNotice)
      } else if (outcome.status === 'downloaded') {
        setNotice(messages.viewer.storyDownloadedNotice)
      }
    }
    try {
      await runExport(movingVideo)
    } catch {
      try {
        const fresh = await onRefresh()
        const replacement = fresh.items.find((item) => item.kind === 'video')
        if (!replacement) throw new Error(messages.viewer.missingPhotoError)
        await runExport(replacement)
      } catch (error) {
        setNotice(error instanceof Error ? localizeErrorMessage(error.message, locale) : messages.viewer.storyExportError)
      }
    } finally {
      setExportingStory(false)
    }
  }

  const refreshBrokenMedia = () => {
    if (refreshedBrokenMedia.current) return
    refreshedBrokenMedia.current = true
    void onRefresh().catch(() => setNotice(messages.viewer.refreshError))
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerStart.current = event.clientX
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerStart.current === null) return
    const distance = event.clientX - pointerStart.current
    pointerStart.current = null
    if (Math.abs(distance) > 48) move(distance > 0 ? -1 : 1)
  }

  if (decorating) {
    return (
      <div className="gallery gallery--decorating">
        <header className="gallery__header">
          <BrandLogo compact />
          <div className="gallery__actions">
            <LanguageSwitch compact />
            <ThemeToggleButton compact onToggle={onToggleTheme} theme={theme} />
            <button className="icon-button" onClick={() => setDecorating(false)} type="button">
              <Icon name="arrow-left" size={17} />
              <span>{messages.viewer.backToAlbum}</span>
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
            <DecorStudio album={album} onClose={() => setDecorating(false)} />
          </Suspense>
        </main>
      </div>
    )
  }

  return (
    <div className="gallery">
      <header className="gallery__header">
        <div className="gallery__brand-group">
          <BrandLogo compact />
          <span className="gallery__header-code">#{album.shareCode.toUpperCase()}</span>
        </div>

        <div className="gallery__actions">
          <LanguageSwitch compact />
          <ThemeToggleButton compact onToggle={onToggleTheme} theme={theme} />
          <button
            aria-label={messages.viewer.decorateAria}
            className="icon-button icon-button--decor"
            onClick={() => setDecorating(true)}
            onFocus={() => void loadDecorStudio()}
            onPointerEnter={() => void loadDecorStudio()}
            type="button"
          >
            <Icon name="decor" size={17} />
            <span>{messages.viewer.decorateLabel}</span>
          </button>
          <button
            aria-label={copied ? messages.viewer.shareAriaCopied : messages.viewer.shareAria}
            className="icon-button"
            onClick={() => void copyLink()}
            type="button"
          >
            <Icon name={copied ? 'check' : 'copy'} size={17} />
            <span className="icon-button__text">{copied ? messages.viewer.copiedLabel : messages.viewer.shareLabel}</span>
          </button>
          {current && (
            <button
              aria-label={messages.viewer.downloadAria}
              className="icon-button icon-button--accent"
              disabled={downloading || savingAll}
              onClick={() => void downloadCurrent()}
              type="button"
            >
              <Icon name="download" size={17} />
              <span className="icon-button__text">
                {downloading ? messages.viewer.downloadingLabel : messages.viewer.downloadLabel}
              </span>
            </button>
          )}
        </div>
      </header>

      <main className="gallery__main">
        {notice && <p className="gallery-notice" role="status">{notice}</p>}

        <section className="album-strip">
          <div className="album-strip__info">
            <h1>{album.title}</h1>
            <p className="album-strip__meta">
              <span className="album-strip__code">#{album.shareCode.toUpperCase()}</span>
              <span aria-hidden="true">·</span>
              <span>{formatAlbumDate(album.createdAt, locale)}</span>
            </p>
          </div>
          <div className="album-strip__right">
            <div className="album-strip__tools">
              <button
                aria-label={messages.viewer.qrAria}
                className="album-tool-button"
                onClick={() => setQrOpen(true)}
                type="button"
              >
                <Icon name="qr" size={16} />
                <span>{messages.viewer.qrLabel}</span>
              </button>
              {movingVideo && (
                <button
                  aria-label={messages.viewer.storyVideoAria}
                  className="album-tool-button"
                  disabled={exportingStory || savingAll || downloading}
                  onClick={() => void exportStoryVideo()}
                  type="button"
                >
                  <Icon name="video" size={16} />
                  <span>
                    {exportingStory ? messages.viewer.exportingStoryLabel : messages.viewer.storyVideoLabel}
                  </span>
                </button>
              )}
              {album.items.length > 1 && (
                <button
                  aria-label={messages.viewer.saveAllAria(album.items.length)}
                  className="album-tool-button album-tool-button--accent"
                  disabled={savingAll || downloading || exportingStory}
                  onClick={() => void saveAllPhotos()}
                  type="button"
                >
                  <Icon name="download-all" size={16} />
                  <span>
                    {savingAll && saveAllProgress
                      ? messages.viewer.preparingAllLabel(saveAllProgress.done, saveAllProgress.total)
                      : messages.viewer.saveAllLabel(album.items.length)}
                  </span>
                </button>
              )}
            </div>
            <div className="album-strip__count" aria-label={messages.viewer.totalFramesAria(album.items.length)}>
              <strong>{padFrame(album.items.length)}</strong>
              <span>{messages.viewer.framesUnit}</span>
            </div>
          </div>
        </section>

        {album.message && <blockquote className="album-message">“{album.message}”</blockquote>}

        {current ? (
          <>
            <section
              aria-label={messages.viewer.viewerAria}
              className="viewer"
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              ref={viewerRef}
            >
              <ViewfinderCorners />

              <div className="viewer__topbar">
                <span>
                  {padFrame(activeIndex + 1)} / {padFrame(album.items.length)} ·{' '}
                  {current.kind === 'video'
                    ? messages.viewer.videoKind
                    : current.kind === 'gif'
                      ? 'GIF'
                      : messages.viewer.photoKind}
                </span>
                <span>
                  {current.width && current.height
                    ? `${current.width}×${current.height}`
                    : `#${album.shareCode.toUpperCase()}`}
                </span>
              </div>

              <MediaView
                albumTitle={album.title}
                item={current}
                onError={refreshBrokenMedia}
                onLoad={handleHeroLoad}
              />

              {album.items.length > 1 && (
                <>
                  <button
                    aria-label={messages.viewer.prevPhotoAria}
                    className="viewer__nav viewer__nav--left"
                    onClick={() => move(-1)}
                    type="button"
                  >
                    <Icon name="chevron-left" size={24} />
                  </button>
                  <button
                    aria-label={messages.viewer.nextPhotoAria}
                    className="viewer__nav viewer__nav--right"
                    onClick={() => move(1)}
                    type="button"
                  >
                    <Icon name="chevron-right" size={24} />
                  </button>
                </>
              )}

              <button
                aria-label={messages.viewer.fullscreenAria}
                className="viewer__fullscreen"
                onClick={() => void enterFullscreen()}
                type="button"
              >
                <Icon name="expand" size={18} />
              </button>
            </section>

            <div className="filmstrip-rail">
              <div className="thumbnail-row" role="list" aria-label={messages.viewer.thumbnailListAria}>
                {album.items.map((item, index) => {
                  const isActive = index === activeIndex
                  const isUnthumbnailedGif = item.kind === 'gif' && !item.thumbnailUrl
                  const isUnthumbnailedVideo = item.kind === 'video' && !item.thumbnailUrl
                  const shouldLoadThumb = !isUnthumbnailedVideo && (isActive || (heroLoaded && !isUnthumbnailedGif))
                  return (
                    <button
                      aria-current={isActive}
                      aria-label={messages.viewer.viewFrameAria(padFrame(index + 1))}
                      className="thumbnail"
                      key={item.id}
                      onClick={() => setActiveIndex(index)}
                      role="listitem"
                      type="button"
                    >
                      {isUnthumbnailedVideo ? (
                        <span className="thumbnail__video" aria-hidden="true">
                          <Icon name="video" size={15} />
                          <span>LIVE</span>
                        </span>
                      ) : shouldLoadThumb ? (
                        <img
                          alt=""
                          crossOrigin="anonymous"
                          decoding="async"
                          fetchPriority={isActive ? 'high' : 'low'}
                          height={56}
                          loading={isActive ? 'eager' : 'lazy'}
                          src={item.thumbnailUrl ?? item.url}
                          width={74}
                        />
                      ) : isUnthumbnailedGif ? (
                        <span className="thumbnail__gif" aria-hidden="true">GIF</span>
                      ) : (
                        <span className="thumbnail__placeholder" aria-hidden="true" />
                      )}
                      <span className="thumbnail__num" aria-hidden="true">{padFrame(index + 1)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="empty-album">
            <Icon name="image" size={34} />
            <h2>{messages.viewer.emptyTitle}</h2>
            <p>{messages.viewer.emptyDesc}</p>
          </div>
        )}
      </main>

      <footer className="gallery__footer">
        <span>{messages.viewer.footerHint}</span>
        <a href="/">
          <Icon name="arrow-left" size={15} />
          <span>{messages.viewer.openAnotherAlbum}</span>
        </a>
      </footer>

      {manualSave && (
        <Suspense fallback={null}>
          <SavePhotoModal
            item={manualSave}
            onClose={() => setManualSave(null)}
            onShared={() => setNotice(messages.viewer.sharedModalNotice)}
          />
        </Suspense>
      )}

      {saveAllModal && (
        <Suspense fallback={null}>
          <SaveAllModal
            onClose={() => setSaveAllModal(null)}
            onCompleted={(message) => setNotice(message)}
            previews={album.items.map((item) => item.thumbnailUrl ?? item.url)}
            shareUrl={albumShareUrl}
            state={saveAllModal}
          />
        </Suspense>
      )}

      {qrOpen && (
        <Suspense fallback={null}>
          <AlbumQrModal
            album={album}
            onClose={() => setQrOpen(false)}
            shareUrl={albumShareUrl}
          />
        </Suspense>
      )}
    </div>
  )
}
