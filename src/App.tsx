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
import { SavePhotoModal, type ManualSaveState } from './SavePhotoModal'
import {
  buildAlbumPath,
  downloadGalleryMedia,
  fetchAlbum,
  getShareCodeFromPath,
  normalizeShareCode,
  preloadGalleryMedia,
  type GalleryAlbum,
  type GalleryMedia,
  type SaveMediaOutcome,
} from './lib/gallery'

type ThemeMode = 'dark' | 'light'

const THEME_STORAGE_KEY = 'khoanhkhac-theme'
const RECENT_ALBUMS_STORAGE_KEY = 'livegallery-recent-albums'
const MAX_RECENT_ALBUMS = 4

interface RecentAlbumEntry {
  shareCode: string
  title: string
  openedAt: string
}

function getInitialTheme(): ThemeMode {
  try {
    if (document.documentElement.dataset.theme === 'light') return 'light'
    if (localStorage.getItem(THEME_STORAGE_KEY) === 'light') return 'light'
  } catch {
    /* Storage may be unavailable in restricted contexts. */
  }
  return 'dark'
}

function useTheme(): [ThemeMode, () => void] {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f3efe6' : '#11100f')
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      /* Storage may be unavailable in private browsing. */
    }
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  return [theme, toggle]
}

function readRecentAlbums(): RecentAlbumEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_ALBUMS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const valid: RecentAlbumEntry[] = []
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue
      const record = entry as Record<string, unknown>
      const shareCode = normalizeShareCode(typeof record.shareCode === 'string' ? record.shareCode : '')
      const title = typeof record.title === 'string' ? record.title.trim() : ''
      const openedAt = typeof record.openedAt === 'string' ? record.openedAt : ''
      if (!shareCode || !title || seen.has(shareCode)) continue
      seen.add(shareCode)
      valid.push({ shareCode, title, openedAt })
      if (valid.length >= MAX_RECENT_ALBUMS) break
    }
    return valid
  } catch {
    return []
  }
}

function recordRecentAlbum(album: GalleryAlbum): void {
  try {
    const next: RecentAlbumEntry[] = [
      {
        shareCode: album.shareCode,
        title: album.title,
        openedAt: new Date().toISOString(),
      },
      ...readRecentAlbums().filter((item) => item.shareCode !== album.shareCode),
    ].slice(0, MAX_RECENT_ALBUMS)
    localStorage.setItem(RECENT_ALBUMS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* Storage is optional. */
  }
}

function removeRecentAlbumEntry(shareCode: string): RecentAlbumEntry[] {
  const next = readRecentAlbums().filter((item) => item.shareCode !== shareCode)
  try {
    localStorage.setItem(RECENT_ALBUMS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* Storage is optional. */
  }
  return next
}

function padFrame(value: number): string {
  return String(value).padStart(2, '0')
}

function CameraMark({ size = 20 }: { size?: number }) {
  return (
    <svg aria-hidden="true" className="camera-mark" height={size} viewBox="0 0 32 32" width={size}>
      <rect height="20" rx="2" width="26" x="3" y="7" />
      <path d="M10 7 12.5 3.5h7L22 7" />
      <circle cx="16" cy="17" r="5.5" />
      <circle className="camera-mark__lens" cx="16" cy="17" r="2" />
    </svg>
  )
}

type IconName =
  | 'arrow-left'
  | 'check'
  | 'chevron-left'
  | 'chevron-right'
  | 'copy'
  | 'decor'
  | 'download'
  | 'expand'
  | 'image'
  | 'moon'
  | 'sun'

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    'arrow-left': <path d="m14 18-6-6 6-6M8 12h11" />,
    check: <path d="M5 12.5 9.5 17 19 7.5" />,
    'chevron-left': <path d="m15 18-6-6 6-6" />,
    'chevron-right': <path d="m9 18 6-6-6-6" />,
    copy: (
      <>
        <rect height="13" rx="1.5" width="13" x="9" y="9" />
        <path d="M5 15H4a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 4 2.5h9.5A1.5 1.5 0 0 1 15 4v1" />
      </>
    ),
    decor: (
      <>
        <path d="M4.5 4.5h10.5l4.5 4.5v10.5a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Z" />
        <path d="M15 4.5V9h4.5" />
        <path d="M9.5 14.5h4.5M11.75 12.25v4.5" />
      </>
    ),
    download: (
      <>
        <path d="M12 3.5v11.5m0 0 4-4m-4 4-4-4" />
        <path d="M4.5 16.5v3a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-3" />
      </>
    ),
    expand: <path d="M8 3.5H3.5V8M16 3.5h4.5V8M8 20.5H3.5V16M16 20.5h4.5V16" />,
    image: (
      <>
        <rect height="17" rx="1.5" width="19" x="2.5" y="3.5" />
        <circle cx="8.5" cy="9.5" r="1.5" />
        <path d="m21.5 15.5-5-5L5.5 20.5" />
      </>
    ),
    moon: <path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
  }
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="square"
      strokeLinejoin="miter"
      strokeWidth="1.9"
      viewBox="0 0 24 24"
      width={size}
    >
      {paths[name]}
    </svg>
  )
}

function ThemeToggleButton({
  theme,
  onToggle,
  compact = false,
}: {
  theme: ThemeMode
  onToggle: () => void
  compact?: boolean
}) {
  const isLight = theme === 'light'
  const label = isLight ? 'Chuyển sang phòng tối' : 'Chuyển sang giao diện sáng'
  return (
    <button
      aria-label={label}
      aria-pressed={isLight}
      className={compact ? 'theme-toggle theme-toggle--compact' : 'theme-toggle'}
      onClick={onToggle}
      title={label}
      type="button"
    >
      <Icon name={isLight ? 'moon' : 'sun'} size={16} />
      {!compact && <span className="theme-toggle__label">{isLight ? 'Tối' : 'Sáng'}</span>}
    </button>
  )
}

function formatAlbumDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value))
}

function LandingPage({ theme, onToggleTheme }: { theme: ThemeMode; onToggleTheme: () => void }) {
  const [value, setValue] = useState('')
  const [message, setMessage] = useState('')
  const [recentAlbums, setRecentAlbums] = useState<RecentAlbumEntry[]>(readRecentAlbums)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const code = normalizeShareCode(value)
    if (!code) {
      setMessage('Mã album gồm ít nhất 6 ký tự (chữ cái, số, dấu gạch ngang hoặc gạch dưới).')
      return
    }
    window.location.assign(buildAlbumPath(code))
  }

  return (
    <div className="landing">
      <header className="landing__header">
        <a className="brand" href="/" aria-label="Khoảnh Khắc Live Gallery - Trang chủ">
          <span className="brand__mark" aria-hidden="true"><CameraMark size={20} /></span>
          <span className="brand__text">
            <strong>Khoảnh Khắc</strong>
            <small>LIVE GALLERY</small>
          </span>
        </a>
        <div className="header-tools">
          <span className="header-note">Ảnh riêng tư theo mã chia sẻ</span>
          <ThemeToggleButton onToggle={onToggleTheme} theme={theme} />
        </div>
      </header>

      <main className="hero">
        <div className="hero__copy">
          <h1>Mở cuộn phim<br />của bạn.</h1>
          <p className="hero__lead">
            Nhập mã in trên ảnh photobooth hoặc quét QR tại quầy để xem lại toàn bộ bản chụp, trang trí sticker và lưu ảnh gốc trực tiếp về điện thoại.
          </p>

          <form className="claim-stub" onSubmit={submit} noValidate>
            <div className="claim-stub__head">
              <label htmlFor="album-code">Mã nhận ảnh</label>
              <span className="claim-stub__spec">6 - 64 KÝ TỰ</span>
            </div>
            <div className="claim-stub__tear" aria-hidden="true" />
            <div className="claim-stub__body">
              <div className="claim-stub__field">
                <span className="claim-stub__hash" aria-hidden="true">#</span>
                <input
                  autoComplete="off"
                  id="album-code"
                  maxLength={64}
                  onChange={(event) => {
                    setValue(event.target.value)
                    setMessage('')
                  }}
                  placeholder="Ví dụ: D44092"
                  spellCheck={false}
                  value={value}
                />
              </div>
              <button className="claim-stub__submit" type="submit">Mở album</button>
            </div>
            <p aria-live="polite" className="claim-stub__message">{message}</p>
          </form>

          {recentAlbums.length > 0 && (
            <section aria-labelledby="recent-albums-title" className="recent-albums">
              <div className="recent-albums__head">
                <h2 id="recent-albums-title">Album vừa mở</h2>
                <span>{padFrame(recentAlbums.length)}</span>
              </div>
              <ul className="recent-albums__list">
                {recentAlbums.map((entry) => (
                  <li className="recent-albums__item" key={entry.shareCode}>
                    <a className="recent-albums__link" href={buildAlbumPath(entry.shareCode)}>
                      <span className="recent-albums__code">#{entry.shareCode.toUpperCase()}</span>
                      <span className="recent-albums__name">{entry.title}</span>
                    </a>
                    <button
                      aria-label={`Xóa album ${entry.title} khỏi danh sách vừa mở`}
                      className="recent-albums__remove"
                      onClick={() => setRecentAlbums(removeRecentAlbumEntry(entry.shareCode))}
                      type="button"
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="hero__visual" aria-hidden="true">
          <div className="darkroom-table">
            <span className="vf-corner vf-corner--tl" />
            <span className="vf-corner vf-corner--tr" />
            <span className="vf-corner vf-corner--bl" />
            <span className="vf-corner vf-corner--br" />

            <div className="darkroom-table__bar">
              <span>35MM CONTACT SHEET</span>
              <span>ẢNH · GIF</span>
            </div>

            <div className="darkroom-table__canvas">
              <div className="filmstrip-35mm">
                <div className="filmstrip-35mm__track" />
                <div className="filmstrip-35mm__frames">
                  <div className="filmstrip-35mm__frame filmstrip-35mm__frame--1">
                    <span className="filmstrip-35mm__num">01</span>
                    <div className="filmstrip-35mm__tone" />
                  </div>
                  <div className="filmstrip-35mm__frame filmstrip-35mm__frame--2">
                    <span className="filmstrip-35mm__num">02</span>
                    <div className="filmstrip-35mm__tone" />
                  </div>
                  <div className="filmstrip-35mm__frame filmstrip-35mm__frame--3">
                    <span className="filmstrip-35mm__num">03</span>
                    <div className="filmstrip-35mm__tone" />
                  </div>
                  <div className="filmstrip-35mm__frame filmstrip-35mm__frame--4">
                    <span className="filmstrip-35mm__num">04</span>
                    <div className="filmstrip-35mm__tone" />
                  </div>
                </div>
                <div className="filmstrip-35mm__track" />
              </div>

              <div className="archival-print">
                <div className="archival-print__exposure">
                  <div className="archival-print__horizon" />
                  <div className="archival-print__figures">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className="archival-print__stamp">04A</span>
                </div>
                <div className="archival-print__caption">
                  <p>Khoảnh Khắc</p>
                  <small>35MM ARCHIVAL PRINT</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="landing__footer">
        <span>Khoảnh Khắc Photobooth</span>
        <span className="footer-mono">35MM ARCHIVAL GALLERY</span>
      </footer>
    </div>
  )
}

function StatusShell({
  theme,
  onToggleTheme,
  children,
}: {
  theme: ThemeMode
  onToggleTheme: () => void
  children: React.ReactNode
}) {
  return (
    <div className="status-shell">
      <header className="landing__header">
        <a className="brand" href="/" aria-label="Khoảnh Khắc Live Gallery - Trang chủ">
          <span className="brand__mark" aria-hidden="true"><CameraMark size={20} /></span>
          <span className="brand__text">
            <strong>Khoảnh Khắc</strong>
            <small>LIVE GALLERY</small>
          </span>
        </a>
        <ThemeToggleButton onToggle={onToggleTheme} theme={theme} />
      </header>
      <main className="status-page">{children}</main>
    </div>
  )
}

function LoadingState({
  code,
  theme,
  onToggleTheme,
}: {
  code: string
  theme: ThemeMode
  onToggleTheme: () => void
}) {
  return (
    <StatusShell onToggleTheme={onToggleTheme} theme={theme}>
      <div className="status-card">
        <span className="status-card__code">#{code.toUpperCase()}</span>
        <div className="film-loader" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <h1>Đang mở cuộn phim...</h1>
        <p>Đang tải bản chụp và tư liệu trang trí từ máy chủ album.</p>
      </div>
    </StatusShell>
  )
}

function ErrorState({
  code,
  message,
  theme,
  onToggleTheme,
}: {
  code: string
  message: string
  theme: ThemeMode
  onToggleTheme: () => void
}) {
  return (
    <StatusShell onToggleTheme={onToggleTheme} theme={theme}>
      <div className="status-card">
        <div className="status-card__icon">
          <Icon name="image" size={26} />
        </div>
        <span className="status-card__code">#{code.toUpperCase()} · KHÔNG THỂ MỞ ALBUM</span>
        <h1>Album chưa sẵn sàng</h1>
        <p>{message}</p>
        <a className="primary-link" href="/">Nhập mã khác</a>
      </div>
    </StatusShell>
  )
}

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
  return (
    <img
      alt={`${albumTitle} - ${item.fileName}`}
      className="viewer__media"
      crossOrigin="anonymous"
      draggable={false}
      fetchPriority="high"
      height={item.height ?? undefined}
      onError={onError}
      onLoad={onLoad}
      src={item.url}
      width={item.width ?? undefined}
    />
  )
}

function AlbumViewer({
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
  const [activeIndex, setActiveIndex] = useState(0)
  const [copied, setCopied] = useState(false)
  const [decorating, setDecorating] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [manualSave, setManualSave] = useState<ManualSaveState | null>(null)
  const [notice, setNotice] = useState('')
  const viewerRef = useRef<HTMLDivElement>(null)
  const pointerStart = useRef<number | null>(null)
  const refreshedBrokenMedia = useRef(false)
  const current = album.items[activeIndex]

  useEffect(() => {
    recordRecentAlbum(album)
  }, [album])

  useEffect(() => {
    preloadGalleryMedia(current)
  }, [current])

  const move = useCallback(
    (direction: -1 | 1) => {
      if (album.items.length < 2) return
      setActiveIndex((index) => (index + direction + album.items.length) % album.items.length)
    },
    [album.items.length],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (decorating || manualSave) return
      if (event.key === 'ArrowLeft') move(-1)
      if (event.key === 'ArrowRight') move(1)
      if (event.key === 'Home') setActiveIndex(0)
      if (event.key === 'End') setActiveIndex(album.items.length - 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [album.items.length, decorating, manualSave, move])

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
      await navigator.clipboard.writeText(window.location.href)
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
      setNotice('Chọn “Lưu hình ảnh” / “Ảnh” trên menu vừa mở để lưu vào bộ sưu tập Ảnh.')
    }
  }

  const downloadCurrent = async () => {
    if (!current || downloading) return
    setDownloading(true)
    setNotice('')
    try {
      const outcome = await downloadGalleryMedia(current)
      applySaveOutcome(outcome)
    } catch {
      try {
        const fresh = await onRefresh()
        const replacement = fresh.items.find((item) => item.id === current.id)
        if (!replacement) throw new Error('Ảnh không còn trong album.')
        const outcome = await downloadGalleryMedia(replacement, { bypassCache: true })
        applySaveOutcome(outcome)
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Không thể tải ảnh.')
      }
    } finally {
      setDownloading(false)
    }
  }

  const refreshBrokenMedia = () => {
    if (refreshedBrokenMedia.current) return
    refreshedBrokenMedia.current = true
    void onRefresh().catch(() => setNotice('Không thể làm mới ảnh. Hãy thử tải lại trang.'))
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
          <a className="brand brand--compact" href="/" aria-label="Khoảnh Khắc Live Gallery - Trang chủ">
            <span className="brand__mark"><CameraMark size={20} /></span>
            <span>
              <strong>Khoảnh Khắc</strong>
              <small>LIVE GALLERY</small>
            </span>
          </a>
          <div className="gallery__actions">
            <ThemeToggleButton compact onToggle={onToggleTheme} theme={theme} />
            <button className="icon-button" onClick={() => setDecorating(false)} type="button">
              <Icon name="arrow-left" size={17} />
              <span>Xem album</span>
            </button>
          </div>
        </header>
        <main className="gallery__decor-main">
          <DecorStudio album={album} onClose={() => setDecorating(false)} />
        </main>
      </div>
    )
  }

  return (
    <div className="gallery">
      <header className="gallery__header">
        <div className="gallery__brand-group">
          <a className="brand brand--compact" href="/" aria-label="Khoảnh Khắc Live Gallery - Trang chủ">
            <span className="brand__mark"><CameraMark size={20} /></span>
            <span>
              <strong>Khoảnh Khắc</strong>
              <small>LIVE GALLERY</small>
            </span>
          </a>
          <span className="gallery__header-code">#{album.shareCode.toUpperCase()}</span>
        </div>

        <div className="gallery__actions">
          <ThemeToggleButton compact onToggle={onToggleTheme} theme={theme} />
          <button
            aria-label="Trang trí ảnh"
            className="icon-button icon-button--decor"
            onClick={() => setDecorating(true)}
            type="button"
          >
            <Icon name="decor" size={17} />
            <span>Trang trí</span>
          </button>
          <button
            aria-label={copied ? 'Đã sao chép liên kết album' : 'Chia sẻ liên kết album'}
            className="icon-button"
            onClick={() => void copyLink()}
            type="button"
          >
            <Icon name={copied ? 'check' : 'copy'} size={17} />
            <span className="icon-button__text">{copied ? 'Đã chép' : 'Chia sẻ'}</span>
          </button>
          {current && (
            <button
              aria-label="Tải ảnh hiện tại"
              className="icon-button icon-button--accent"
              disabled={downloading}
              onClick={() => void downloadCurrent()}
              type="button"
            >
              <Icon name="download" size={17} />
              <span className="icon-button__text">{downloading ? 'Đang tải...' : 'Tải ảnh'}</span>
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
              <span>{formatAlbumDate(album.createdAt)}</span>
            </p>
          </div>
          <div className="album-strip__count" aria-label={`Tổng cộng ${album.items.length} khung ảnh`}>
            <strong>{padFrame(album.items.length)}</strong>
            <span>KHUNG</span>
          </div>
        </section>

        {album.message && <blockquote className="album-message">“{album.message}”</blockquote>}

        {current ? (
          <>
            <section
              aria-label="Trình xem album"
              className="viewer"
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              ref={viewerRef}
            >
              <span className="vf-corner vf-corner--tl" aria-hidden="true" />
              <span className="vf-corner vf-corner--tr" aria-hidden="true" />
              <span className="vf-corner vf-corner--bl" aria-hidden="true" />
              <span className="vf-corner vf-corner--br" aria-hidden="true" />

              <div className="viewer__topbar">
                <span>
                  {padFrame(activeIndex + 1)} / {padFrame(album.items.length)} ·{' '}
                  {current.kind === 'gif' ? 'GIF' : 'ẢNH'}
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
                onLoad={() => {
                  refreshedBrokenMedia.current = false
                }}
              />

              {album.items.length > 1 && (
                <>
                  <button
                    aria-label="Ảnh trước"
                    className="viewer__nav viewer__nav--left"
                    onClick={() => move(-1)}
                    type="button"
                  >
                    <Icon name="chevron-left" size={24} />
                  </button>
                  <button
                    aria-label="Ảnh tiếp theo"
                    className="viewer__nav viewer__nav--right"
                    onClick={() => move(1)}
                    type="button"
                  >
                    <Icon name="chevron-right" size={24} />
                  </button>
                </>
              )}

              <button
                aria-label="Xem toàn màn hình"
                className="viewer__fullscreen"
                onClick={() => void enterFullscreen()}
                type="button"
              >
                <Icon name="expand" size={18} />
              </button>
            </section>

            <div className="filmstrip-rail">
              <div className="thumbnail-row" role="list" aria-label="Danh sách khung ảnh 35mm">
                {album.items.map((item, index) => (
                  <button
                    aria-current={index === activeIndex}
                    aria-label={`Xem khung ảnh ${padFrame(index + 1)}`}
                    className="thumbnail"
                    key={item.id}
                    onClick={() => setActiveIndex(index)}
                    role="listitem"
                    type="button"
                  >
                    <img
                      alt=""
                      crossOrigin="anonymous"
                      height={56}
                      loading="lazy"
                      src={item.thumbnailUrl ?? item.url}
                      width={74}
                    />
                    <span className="thumbnail__num" aria-hidden="true">{padFrame(index + 1)}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="empty-album">
            <Icon name="image" size={34} />
            <h2>Album chưa có ảnh</h2>
            <p>Ảnh mới sẽ xuất hiện tại đây ngay sau khi máy photobooth tải lên.</p>
          </div>
        )}
      </main>

      <footer className="gallery__footer">
        <span>Dùng phím mũi tên hoặc vuốt để chuyển khung ảnh</span>
        <a href="/">
          <Icon name="arrow-left" size={15} />
          <span>Mở album khác</span>
        </a>
      </footer>

      <SavePhotoModal
        item={manualSave}
        onClose={() => setManualSave(null)}
        onShared={() => setNotice('Đã mở menu lưu ảnh vào bộ sưu tập Ảnh.')}
      />
    </div>
  )
}

function AlbumRoute({
  code,
  theme,
  onToggleTheme,
}: {
  code: string
  theme: ThemeMode
  onToggleTheme: () => void
}) {
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

  if (error) return <ErrorState code={code} message={error} onToggleTheme={onToggleTheme} theme={theme} />
  if (!album) return <LoadingState code={code} onToggleTheme={onToggleTheme} theme={theme} />
  return <AlbumViewer album={album} onRefresh={refresh} onToggleTheme={onToggleTheme} theme={theme} />
}

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const shareCode = getShareCodeFromPath(window.location.pathname)
  return shareCode ? (
    <AlbumRoute code={shareCode} onToggleTheme={toggleTheme} theme={theme} />
  ) : (
    <LandingPage onToggleTheme={toggleTheme} theme={theme} />
  )
}
