import type { ReactNode } from 'react'
import type { ThemeMode } from '../hooks/useTheme'
import { BrandLogo, Icon, ThemeToggleButton } from './Chrome'

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
        <ThemeToggleButton onToggle={onToggleTheme} theme={theme} />
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
