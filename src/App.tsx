import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import './App.css'
import { AlbumViewer } from './components/AlbumViewer'
import { LandingPage } from './components/LandingPage'
import { ErrorState, LoadingState } from './components/StatusViews'
import { type ThemeMode, useTheme } from './hooks/useTheme'
import { LocaleProvider } from './i18n/LocaleContext'
import { localizeErrorMessage } from './i18n/core'
import { useLocale } from './i18n/useLocale'
import { fetchAlbum, getShareCodeFromPath, type GalleryAlbum } from './lib/gallery'

const loadDiyStudio = () =>
  import('./components/DiyPhotoboothStudio').then((mod) => ({ default: mod.DiyPhotoboothStudio }))
const DiyPhotoboothStudio = lazy(loadDiyStudio)

function isCreateRoute(pathname: string): boolean {
  return pathname === '/create' || pathname === '/create/'
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
  const { locale, messages } = useLocale()
  const [album, setAlbum] = useState<GalleryAlbum | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetchAlbum(code, controller.signal)
      .then(setAlbum)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : '')
      })
    return () => controller.abort()
  }, [code])

  const refresh = useCallback(async () => {
    const next = await fetchAlbum(code, undefined, { bypassCache: true })
    setAlbum(next)
    return next
  }, [code])

  if (error) {
    return (
      <ErrorState
        code={code}
        message={localizeErrorMessage(error, locale) || messages.status.fallbackLoadError}
        onToggleTheme={onToggleTheme}
        theme={theme}
      />
    )
  }
  if (!album) return <LoadingState code={code} onToggleTheme={onToggleTheme} theme={theme} />
  return <AlbumViewer album={album} onRefresh={refresh} onToggleTheme={onToggleTheme} theme={theme} />
}

function LiveGalleryApp() {
  const { messages } = useLocale()
  const [theme, toggleTheme] = useTheme()
  const [pathname, setPathname] = useState(() => window.location.pathname)

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((nextPath: string) => {
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, '', nextPath)
    }
    setPathname(nextPath)
  }, [])

  const shareCode = getShareCodeFromPath(pathname)
  if (shareCode) {
    return <AlbumRoute code={shareCode} onToggleTheme={toggleTheme} theme={theme} />
  }

  if (isCreateRoute(pathname)) {
    return (
      <Suspense
        fallback={(
          <div className="status-card" style={{ margin: '48px auto' }}>
            <div className="film-loader" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
            <h1>{messages.diy.openingStudio}</h1>
          </div>
        )}
      >
        <DiyPhotoboothStudio
          onBackHome={() => navigate('/')}
          onToggleTheme={toggleTheme}
          theme={theme}
        />
      </Suspense>
    )
  }

  return (
    <LandingPage
      onOpenCreate={() => navigate('/create')}
      onPrefetchCreate={() => void loadDiyStudio()}
      onToggleTheme={toggleTheme}
      theme={theme}
    />
  )
}

export default function App() {
  return (
    <LocaleProvider>
      <LiveGalleryApp />
    </LocaleProvider>
  )
}
