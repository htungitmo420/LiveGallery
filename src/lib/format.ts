import { getIntlLocaleTag, type Locale } from '../i18n/core'

export function padFrame(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatAlbumDate(value: string, locale: Locale = 'vi'): string {
  return new Intl.DateTimeFormat(getIntlLocaleTag(locale), {
    dateStyle: 'long',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value))
}
