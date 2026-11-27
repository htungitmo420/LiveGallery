import { createContext, useContext } from 'react'
import { getMessages, type GalleryMessages, type Locale } from './core'

export interface LocaleContextValue {
  locale: Locale
  setLocale: (next: Locale) => void
  messages: GalleryMessages
}

export const LocaleContext = createContext<LocaleContextValue>({
  locale: 'vi',
  setLocale: () => undefined,
  messages: getMessages('vi'),
})

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext)
}
