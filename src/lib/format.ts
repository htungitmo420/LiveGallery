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

export function formatRecentOpenedAt(value: string, locale: Locale = 'vi'): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(getIntlLocaleTag(locale), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date)
}
