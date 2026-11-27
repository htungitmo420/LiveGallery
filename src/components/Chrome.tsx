import type { ReactNode } from 'react'
import type { ThemeMode } from '../hooks/useTheme'

export function CameraMark({ size = 20 }: { size?: number }) {
  return (
    <svg aria-hidden="true" className="camera-mark" height={size} viewBox="0 0 32 32" width={size}>
      <rect height="20" rx="2" width="26" x="3" y="7" />
      <path d="M10 7 12.5 3.5h7L22 7" />
      <circle cx="16" cy="17" r="5.5" />
      <circle className="camera-mark__lens" cx="16" cy="17" r="2" />
    </svg>
  )
}

export type IconName =
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

const ICON_PATHS: Record<IconName, ReactNode> = {
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

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
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
      {ICON_PATHS[name]}
    </svg>
  )
}

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <a
      aria-label="Khoảnh Khắc Live Gallery - Trang chủ"
      className={compact ? 'brand brand--compact' : 'brand'}
      href="/"
    >
      <span aria-hidden="true" className="brand__mark"><CameraMark size={20} /></span>
      <span className={compact ? undefined : 'brand__text'}>
        <strong>Khoảnh Khắc</strong>
        <small>LIVE GALLERY</small>
      </span>
    </a>
  )
}

export function ThemeToggleButton({
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

export function ViewfinderCorners() {
  return (
    <>
      <span aria-hidden="true" className="vf-corner vf-corner--tl" />
      <span aria-hidden="true" className="vf-corner vf-corner--tr" />
      <span aria-hidden="true" className="vf-corner vf-corner--bl" />
      <span aria-hidden="true" className="vf-corner vf-corner--br" />
    </>
  )
}
