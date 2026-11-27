import { type FormEvent, useEffect, useState } from 'react'
import type { ThemeMode } from '../hooks/useTheme'
import { useLocale } from '../i18n/useLocale'
import { formatRecentOpenedAt, padFrame } from '../lib/format'
import { buildAlbumPath, normalizeShareCode } from '../lib/gallery'
import {
  clearRecentAlbums,
  readRecentAlbums,
  removeRecentAlbumEntry,
  type RecentAlbumEntry,
} from '../lib/recentAlbums'
import { BrandLogo, Icon, LanguageSwitch, ThemeToggleButton, ViewfinderCorners } from './Chrome'

export function LandingPage({
  theme,
  onToggleTheme,
  onOpenCreate,
  onPrefetchCreate,
}: {
  theme: ThemeMode
  onToggleTheme: () => void
  onOpenCreate: () => void
  onPrefetchCreate?: () => void
}) {
  const { locale, messages } = useLocale()
  const [value, setValue] = useState('')
  const [invalidCode, setInvalidCode] = useState(false)
  const [recentAlbums, setRecentAlbums] = useState<RecentAlbumEntry[]>(readRecentAlbums)

  useEffect(() => {
    const syncRecent = () => setRecentAlbums(readRecentAlbums())
    window.addEventListener('storage', syncRecent)
    window.addEventListener('pageshow', syncRecent)
    return () => {
      window.removeEventListener('storage', syncRecent)
      window.removeEventListener('pageshow', syncRecent)
    }
  }, [])

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

          <section aria-labelledby="diy-entry-title" className="diy-entry">
            <div className="diy-entry__copy">
              <p className="diy-entry__badge">{messages.landing.diyBadge}</p>
              <h2 id="diy-entry-title">{messages.landing.diyTitle}</h2>
              <p>{messages.landing.diyDesc}</p>
            </div>
            <a
              className="diy-entry__cta"
              href="/create"
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
                event.preventDefault()
                onOpenCreate()
              }}
              onFocus={() => onPrefetchCreate?.()}
              onPointerEnter={() => onPrefetchCreate?.()}
            >
              <Icon name="image" size={16} />
              <span>{messages.landing.diyAction}</span>
            </a>
          </section>

          {recentAlbums.length > 0 && (
            <section aria-labelledby="recent-albums-title" className="recent-albums">
              <div className="recent-albums__head">
                <div className="recent-albums__heading">
                  <h2 id="recent-albums-title">{messages.landing.recentTitle}</h2>
                  <span className="recent-albums__count">{padFrame(recentAlbums.length)}</span>
                </div>
                <button
                  aria-label={messages.landing.clearRecentAria}
                  className="recent-albums__clear"
                  onClick={() => setRecentAlbums(clearRecentAlbums())}
                  type="button"
                >
                  {messages.landing.clearRecent}
                </button>
              </div>
              <p className="recent-albums__hint">{messages.landing.recentHint}</p>
              <ul className="recent-albums__list">
                {recentAlbums.map((entry) => {
                  const openedLabel = formatRecentOpenedAt(entry.openedAt, locale)
                  const metaParts = [
                    entry.itemCount !== undefined && entry.itemCount > 0
                      ? messages.landing.recentFrameCount(entry.itemCount)
                      : '',
                    openedLabel,
                  ].filter(Boolean)

                  return (
                    <li className="recent-albums__item" key={entry.shareCode}>
                      <a className="recent-albums__link" href={buildAlbumPath(entry.shareCode)}>
                        <span className="recent-albums__code">#{entry.shareCode.toUpperCase()}</span>
                        <span className="recent-albums__body">
                          <span className="recent-albums__name">{entry.title}</span>
                          {metaParts.length > 0 && (
                            <span className="recent-albums__meta">{metaParts.join(' · ')}</span>
                          )}
                        </span>
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
                  )
                })}
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
