import { type FormEvent, useState } from 'react'
import type { ThemeMode } from '../hooks/useTheme'
import { useLocale } from '../i18n/useLocale'
import { padFrame } from '../lib/format'
import { buildAlbumPath, normalizeShareCode } from '../lib/gallery'
import {
  readRecentAlbums,
  removeRecentAlbumEntry,
  type RecentAlbumEntry,
} from '../lib/recentAlbums'
import { BrandLogo, LanguageSwitch, ThemeToggleButton, ViewfinderCorners } from './Chrome'

export function LandingPage({
  theme,
  onToggleTheme,
}: {
  theme: ThemeMode
  onToggleTheme: () => void
}) {
  const { messages } = useLocale()
  const [value, setValue] = useState('')
  const [invalidCode, setInvalidCode] = useState(false)
  const [recentAlbums, setRecentAlbums] = useState<RecentAlbumEntry[]>(readRecentAlbums)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const code = normalizeShareCode(value)
    if (!code) {
      setInvalidCode(true)
      return
    }
    window.location.assign(buildAlbumPath(code))
  }

  return (
    <div className="landing">
      <header className="landing__header">
        <BrandLogo />
        <div className="header-tools">
          <span className="header-note">{messages.landing.privacyNote}</span>
          <LanguageSwitch />
          <ThemeToggleButton onToggle={onToggleTheme} theme={theme} />
        </div>
      </header>

      <main className="hero">
        <div className="hero__copy">
          <h1>{messages.landing.heroTitleLine1}<br />{messages.landing.heroTitleLine2}</h1>
          <p className="hero__lead">
            {messages.landing.heroLead}
          </p>

          <form className="claim-stub" onSubmit={submit} noValidate>
            <div className="claim-stub__head">
              <label htmlFor="album-code">{messages.landing.claimLabel}</label>
              <span className="claim-stub__spec">{messages.landing.claimSpec}</span>
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
                    setInvalidCode(false)
                  }}
                  placeholder={messages.landing.claimPlaceholder}
                  spellCheck={false}
                  value={value}
                />
              </div>
              <button className="claim-stub__submit" type="submit">{messages.landing.claimSubmit}</button>
            </div>
            <p aria-live="polite" className="claim-stub__message">
              {invalidCode ? messages.landing.claimInvalid : ''}
            </p>
          </form>

          {recentAlbums.length > 0 && (
            <section aria-labelledby="recent-albums-title" className="recent-albums">
              <div className="recent-albums__head">
                <h2 id="recent-albums-title">{messages.landing.recentTitle}</h2>
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
                      aria-label={messages.landing.removeRecentAria(entry.title)}
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
              <span>{messages.landing.contactSheetBar}</span>
              <span>{messages.landing.mediaTag}</span>
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
        <span>{messages.landing.footerBrand}</span>
        <span className="footer-mono">{messages.landing.footerMono}</span>
      </footer>
    </div>
  )
}
