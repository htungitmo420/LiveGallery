import {
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import './App.css'
import { DecorStudio } from './DecorStudio'
import {
  buildAlbumPath,
  downloadGalleryMedia,
  fetchAlbum,
  getShareCodeFromPath,
  normalizeShareCode,
  type GalleryAlbum,
  type GalleryMedia,
} from './lib/gallery'

function CameraMark({ size = 34 }: { size?: number }) {
  return (
    <svg aria-hidden="true" className="camera-mark" height={size} viewBox="0 0 48 48" width={size}>
      <rect height="30" rx="9" width="40" x="4" y="11" />
      <path d="M16 11 19 6h10l3 5" />
      <circle cx="24" cy="26" r="8" />
      <circle className="camera-mark__lens" cx="24" cy="26" r="3" />
    </svg>
  )
}

type IconName = 'arrow-left' | 'chevron-left' | 'chevron-right' | 'copy' | 'download' | 'expand' | 'image' | 'play' | 'search'

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    'arrow-left': <path d="m15 18-6-6 6-6M9 12h10" />,
    'chevron-left': <path d="m15 18-6-6 6-6" />,
    'chevron-right': <path d="m9 18 6-6-6-6" />,
    copy: <><rect height="13" rx="2" width="13" x="9" y="9" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 21h14a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2" /></>,
    expand: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /></>,
    image: <><rect height="18" rx="3" width="20" x="2" y="3" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    play: <path d="m8 5 11 7-11 7V5Z" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  }
  return <svg aria-hidden="true" fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width={size}>{paths[name]}</svg>
}

function formatAlbumDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value))
}

function LandingPage() {
  const [value, setValue] = useState('')
  const [message, setMessage] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const code = normalizeShareCode(value)
    if (!code) {
      setMessage('Mã album gồm ít nhất 6 ký tự.')
      return
    }
    window.location.assign(buildAlbumPath(code))
  }

  return (
    <main className="landing">
      <header className="landing__header">
        <a className="brand" href="/" aria-label="LiveGallery - Trang chủ">
          <span className="brand__mark"><CameraMark /></span>
          <span><strong>Khoảnh Khắc</strong><small>LIVE GALLERY</small></span>
        </a>
        <span className="privacy-pill">Ảnh riêng tư theo mã chia sẻ</span>
      </header>

      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">ALBUM CỦA BẠN ĐÃ SẴN SÀNG</p>
          <h1>Mang khoảnh khắc<br />về cùng bạn.</h1>
          <p className="hero__lead">Nhập mã trên màn hình photobooth hoặc quét QR để xem, phát lại và tải ảnh ngay trên thiết bị của bạn.</p>

          <form className="lookup" onSubmit={submit} noValidate>
            <label htmlFor="album-code">Mã album</label>
            <div className="lookup__row">
              <span className="lookup__icon"><Icon name="search" /></span>
              <input autoComplete="off" id="album-code" maxLength={64}
                onChange={(event) => { setValue(event.target.value); setMessage('') }}
                placeholder="Ví dụ: D44092" spellCheck={false} value={value} />
              <button type="submit">Mở album</button>
            </div>
            <p aria-live="polite" className="lookup__message">{message}</p>
          </form>
        </div>

        <div className="hero__visual" aria-hidden="true">
          <div className="orbit orbit--one" /><div className="orbit orbit--two" />
          <div className="photo-card photo-card--back"><div className="photo-card__picture photo-card__picture--warm" /></div>
          <div className="photo-card photo-card--front">
            <div className="photo-card__picture">
              <span className="spark spark--one">✦</span><span className="spark spark--two">✦</span>
              <div className="silhouette"><span /><span /><span /></div>
            </div>
            <p>NHỮNG NGÀY THẬT VUI</p><small>18 · 10 · 2026</small>
          </div>
          <div className="floating-badge">Ảnh + GIF</div>
        </div>
      </section>

      <footer className="landing__footer">
        <span>Khoảnh Khắc Photobooth</span><span>Ảnh được bảo vệ bằng mã chia sẻ</span>
      </footer>
    </main>
  )
}

function LoadingState() {
  return <main className="status-page">
    <div className="status-page__brand"><CameraMark size={42} /></div>
    <div className="loader" aria-hidden="true"><span /><span /><span /></div>
    <h1>Đang mở album...</h1><p>Khoảnh khắc của bạn sắp hiện ra.</p>
  </main>
}

function ErrorState({ message }: { message: string }) {
  return <main className="status-page">
    <div className="status-page__brand"><Icon name="image" size={34} /></div>
    <p className="eyebrow">KHÔNG THỂ MỞ ALBUM</p>
    <h1>Album chưa sẵn sàng</h1><p>{message}</p>
    <a className="primary-link" href="/">Nhập mã khác</a>
  </main>
}

function MediaView({ item, albumTitle, onError, onLoad }: { item: GalleryMedia; albumTitle: string; onError: () => void; onLoad: () => void }) {
  return <img alt={`${albumTitle} – ${item.fileName}`} className="viewer__media" draggable={false} onError={onError} onLoad={onLoad} src={item.url} />
}

function AlbumViewer({ album, onRefresh }: { album: GalleryAlbum; onRefresh: () => Promise<GalleryAlbum> }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [copied, setCopied] = useState(false)
  const [decorating, setDecorating] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [notice, setNotice] = useState('')
  const viewerRef = useRef<HTMLDivElement>(null)
  const pointerStart = useRef<number | null>(null)
  const refreshedBrokenMedia = useRef(false)
  const current = album.items[activeIndex]

  const move = useCallback((direction: -1 | 1) => {
    if (album.items.length < 2) return
    setActiveIndex((index) => (index + direction + album.items.length) % album.items.length)
  }, [album.items.length])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') move(-1)
      if (event.key === 'ArrowRight') move(1)
      if (event.key === 'Home') setActiveIndex(0)
      if (event.key === 'End') setActiveIndex(album.items.length - 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [album.items.length, move])

  const enterFullscreen = async () => {
    if (!viewerRef.current) return
    try { await viewerRef.current.requestFullscreen() } catch { /* Fullscreen may be unavailable. */ }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch { setCopied(false) }
  }

  const downloadCurrent = async () => {
    if (!current || downloading) return
    setDownloading(true)
    setNotice('')
    try {
      await downloadGalleryMedia(current)
    } catch {
      try {
        const fresh = await onRefresh()
        const replacement = fresh.items.find((item) => item.id === current.id)
        if (!replacement) throw new Error('Ảnh không còn trong album.')
        await downloadGalleryMedia(replacement)
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Không thể tải ảnh.')
      }
    } finally { setDownloading(false) }
  }

  const refreshBrokenMedia = () => {
    if (refreshedBrokenMedia.current) return
    refreshedBrokenMedia.current = true
    void onRefresh().catch(() => setNotice('Không thể làm mới ảnh. Hãy thử tải lại trang.'))
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => { pointerStart.current = event.clientX }
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerStart.current === null) return
    const distance = event.clientX - pointerStart.current
    pointerStart.current = null
    if (Math.abs(distance) > 48) move(distance > 0 ? -1 : 1)
  }

  if (decorating) return <main className="gallery">
    <header className="gallery__header">
      <a className="brand brand--compact" href="/" aria-label="Trang chủ"><span className="brand__mark"><CameraMark size={28} /></span><span><strong>Khoảnh Khắc</strong><small>LIVE GALLERY</small></span></a>
      <button className="icon-button" onClick={() => setDecorating(false)} type="button"><Icon name="arrow-left" /><span>Xem album</span></button>
    </header>
    <DecorStudio album={album} onClose={() => setDecorating(false)} />
  </main>

  return (
    <main className="gallery">
      <header className="gallery__header">
        <a className="brand brand--compact" href="/" aria-label="Trang chủ">
          <span className="brand__mark"><CameraMark size={28} /></span>
          <span><strong>Khoảnh Khắc</strong><small>LIVE GALLERY</small></span>
        </a>
        <div className="gallery__actions">
          <button className="icon-button" onClick={() => setDecorating(true)} type="button"><span aria-hidden="true">✨</span><span>Trang trí</span></button>
          <button className="icon-button" onClick={copyLink} type="button"><Icon name="copy" /><span>{copied ? 'Đã sao chép' : 'Chia sẻ'}</span></button>
          {current && <button className="icon-button icon-button--accent" disabled={downloading} onClick={() => void downloadCurrent()} type="button"><Icon name="download" /><span>{downloading ? 'Đang tải…' : 'Tải ảnh'}</span></button>}
        </div>
      </header>

      {notice && <p className="gallery-notice" role="status">{notice}</p>}

      <section className="album-heading">
        <div><p className="eyebrow">ALBUM CỦA BẠN</p><h1>{album.title}</h1><p>{formatAlbumDate(album.createdAt)}</p></div>
        <div className="album-heading__count"><strong>{album.items.length}</strong><span>khoảnh khắc</span></div>
      </section>

      {album.message && <blockquote className="album-message">“{album.message}”</blockquote>}

      {current ? <>
        <section aria-label="Trình xem album" className="viewer" onPointerDown={onPointerDown} onPointerUp={onPointerUp} ref={viewerRef}>
          <div className="viewer__topbar">
            <span>{current.kind === 'gif' ? 'GIF' : 'ẢNH'}</span>
            <span>{activeIndex + 1} / {album.items.length}</span>
          </div>
          <MediaView albumTitle={album.title} item={current} onError={refreshBrokenMedia} onLoad={() => { refreshedBrokenMedia.current = false }} />
          {album.items.length > 1 && <>
            <button aria-label="Ảnh trước" className="viewer__nav viewer__nav--left" onClick={() => move(-1)} type="button"><Icon name="chevron-left" size={26} /></button>
            <button aria-label="Ảnh tiếp theo" className="viewer__nav viewer__nav--right" onClick={() => move(1)} type="button"><Icon name="chevron-right" size={26} /></button>
          </>}
          <button aria-label="Xem toàn màn hình" className="viewer__fullscreen" onClick={enterFullscreen} type="button"><Icon name="expand" /></button>
        </section>

        <div className="thumbnail-row" role="list" aria-label="Danh sách ảnh">
          {album.items.map((item, index) => <button aria-label={`Xem khoảnh khắc ${index + 1}`} aria-current={index === activeIndex}
            className="thumbnail" key={item.id} onClick={() => setActiveIndex(index)} role="listitem" type="button">
            <img alt="" loading="lazy" src={item.thumbnailUrl ?? item.url} />
          </button>)}
        </div>
        <p className="gallery__hint">Dùng phím mũi tên hoặc vuốt để chuyển ảnh</p>
      </> : <div className="empty-album"><Icon name="image" size={36} /><h2>Album chưa có ảnh</h2><p>Ảnh mới sẽ xuất hiện tại đây sau khi photobooth tải lên.</p></div>}

      <footer className="gallery__footer">
        <span>Khoảnh Khắc Photobooth</span><a href="/"><Icon name="arrow-left" size={16} /> Mở album khác</a>
      </footer>
    </main>
  )
}

function AlbumRoute({ code }: { code: string }) {
  const [album, setAlbum] = useState<GalleryAlbum | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetchAlbum(code, controller.signal)
      .then(setAlbum)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : 'Không thể tải album lúc này.')
      })
    return () => controller.abort()
  }, [code])

  const refresh = useCallback(async () => {
    const next = await fetchAlbum(code)
    setAlbum(next)
    return next
  }, [code])

  if (error) return <ErrorState message={error} />
  if (!album) return <LoadingState />
  return <AlbumViewer album={album} onRefresh={refresh} />
}

export default function App() {
  const shareCode = getShareCodeFromPath(window.location.pathname)
  return shareCode ? <AlbumRoute code={shareCode} /> : <LandingPage />
}
