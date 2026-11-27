import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import {
  LOCALE_STORAGE_KEY,
  getInitialLocale,
  getMessages,
  type Locale,
} from './core'
import { LocaleContext, type LocaleContextValue } from './useLocale'

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getInitialLocale())

  useEffect(() => {
    document.documentElement.lang = locale
    document.title = getMessages(locale).documentTitle
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    } catch {
      /* Storage may be unavailable in private browsing. */
    }
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
  }, [])

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale,
    messages: getMessages(locale),
  }), [locale, setLocale])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}
