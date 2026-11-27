import { useCallback, useEffect, useState } from 'react'

export type ThemeMode = 'dark' | 'light'

const THEME_STORAGE_KEY = 'khoanhkhac-theme'

function getInitialTheme(): ThemeMode {
  try {
    if (document.documentElement.dataset.theme === 'light') return 'light'
    if (localStorage.getItem(THEME_STORAGE_KEY) === 'light') return 'light'
  } catch {
    /* Storage may be unavailable in restricted contexts. */
  }
  return 'dark'
}

export function useTheme(): [ThemeMode, () => void] {
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
