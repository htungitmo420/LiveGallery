import type { ReactNode } from 'react'
import type { ThemeMode } from '../hooks/useTheme'
import { useLocale } from '../i18n/useLocale'
import { BrandLogo, Icon, LanguageSwitch, ThemeToggleButton } from './Chrome'

function StatusShell({
  theme,
  onToggleTheme,
  children,
}: {
  theme: ThemeMode
  onToggleTheme: () => void
  children: ReactNode
}) {
  return (
    <div className="status-shell">
      <header className="landing__header">
        <BrandLogo />
        <div className="header-tools">
          <LanguageSwitch />
          <ThemeToggleButton onToggle={onToggleTheme} theme={theme} />
        </div>
      </header>
      <main className="status-page">{children}</main>
    </div>
  )
}

export function LoadingState({
  code,
  theme,
  onToggleTheme,
}: {
  code: string
  theme: ThemeMode
  onToggleTheme: () => void
}) {
  const { messages } = useLocale()
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
        <h1>{messages.status.loadingTitle}</h1>
        <p>{messages.status.loadingDesc}</p>
      </div>
    </StatusShell>
  )
}

export function ErrorState({
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
  const { messages } = useLocale()
  return (
    <StatusShell onToggleTheme={onToggleTheme} theme={theme}>
      <div className="status-card">
        <div className="status-card__icon">
          <Icon name="image" size={26} />
        </div>
        <span className="status-card__code">#{code.toUpperCase()} · {messages.status.errorCodeSuffix}</span>
        <h1>{messages.status.errorTitle}</h1>
        <p>{message}</p>
        <a className="primary-link" href="/">{messages.status.tryAnotherCode}</a>
      </div>
    </StatusShell>
  )
}
