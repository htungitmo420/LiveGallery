import { type FormEvent, useState } from 'react'
import type { ThemeMode } from '../hooks/useTheme'
import { padFrame } from '../lib/format'
import { buildAlbumPath, normalizeShareCode } from '../lib/gallery'
import {
  readRecentAlbums,
  removeRecentAlbumEntry,
  type RecentAlbumEntry,
} from '../lib/recentAlbums'
import { BrandLogo, ThemeToggleButton, ViewfinderCorners } from './Chrome'

export function LandingPage({
  theme,
  onToggleTheme,
}: {
  theme: ThemeMode
  onToggleTheme: () => void
}) {
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
        <BrandLogo />
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
            <ViewfinderCorners />

            <div className="darkroom-table__bar">
              <span>35MM CONTACT SHEET</span>
              <span>ẢNH · GIF</span>
            </div>

            <div className="darkroom-table__canvas">
              <div className="filmstrip-35mm">
                <div className="filmstrip-35mm__track" />
                <div className="filmstrip-35mm__frames">
                  {[1, 2, 3, 4].map((frame) => (
                    <div className={`filmstrip-35mm__frame filmstrip-35mm__frame--${frame}`} key={frame}>
                      <span className="filmstrip-35mm__num">{padFrame(frame)}</span>
                      <div className="filmstrip-35mm__tone" />
                    </div>
                  ))}
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
