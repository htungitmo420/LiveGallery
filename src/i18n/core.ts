import { enMessages } from './en'
import { ruMessages } from './ru'
import { LOCALE_OPTIONS, type GalleryMessages, type Locale } from './types'
import { viMessages } from './vi'

export const LOCALE_STORAGE_KEY = 'khoanhkhac-locale'

const MESSAGES_BY_LOCALE: Record<Locale, GalleryMessages> = {
  vi: viMessages,
  en: enMessages,
  ru: ruMessages,
}

const INTL_LOCALE_TAG: Record<Locale, string> = {
  vi: 'vi-VN',
  en: 'en-US',
  ru: 'ru-RU',
}

const ERROR_TRANSLATIONS: Record<string, { en: string; ru: string }> = {
  'Mã album không hợp lệ.': {
    en: 'Invalid album code.',
    ru: 'Неверный код альбома.',
  },
  'LiveGallery chưa được kết nối với máy chủ album.': {
    en: 'LiveGallery is not connected to the album server yet.',
    ru: 'LiveGallery пока не подключён к серверу альбомов.',
  },
  'Không thể tải album lúc này.': {
    en: 'Unable to load the album right now.',
    ru: 'Не удалось загрузить альбом прямо сейчас.',
  },
  'Album không tồn tại hoặc đã hết hạn.': {
    en: 'Album not found or has expired.',
    ru: 'Альбом не найден или срок его хранения истёк.',
  },
  'Không thể mở tệp trong album.': {
    en: 'Unable to open files in this album.',
    ru: 'Не удалось открыть файлы в этом альбоме.',
  },
  'Máy chủ album chưa được cấu hình.': {
    en: 'Album server is not configured.',
    ru: 'Сервер альбомов не настроен.',
  },
  'Dữ liệu album không hợp lệ.': {
    en: 'Invalid album data.',
    ru: 'Некорректные данные альбома.',
  },
  'Không tìm thấy album.': {
    en: 'Album not found.',
    ru: 'Альбом не найден.',
  },
  'Dữ liệu album chưa đầy đủ.': {
    en: 'Incomplete album data.',
    ru: 'Неполные данные альбома.',
  },
  'Dữ liệu ảnh không hợp lệ.': {
    en: 'Invalid photo data.',
    ru: 'Некорректные данные изображения.',
  },
  'Liên kết ảnh đã hết hạn.': {
    en: 'Photo link has expired.',
    ru: 'Срок действия ссылки на фото истёк.',
  },
  'Không thể tạo bản xem trước ảnh.': {
    en: 'Could not create photo preview.',
    ru: 'Не удалось создать предпросмотр фото.',
  },
  'Không thể xử lý định dạng ảnh.': {
    en: 'Could not process image format.',
    ru: 'Не удалось обработать формат изображения.',
  },
  'Không thể tải ảnh để trang trí.': {
    en: 'Could not load image for editing.',
    ru: 'Не удалось загрузить изображение для редактирования.',
  },
  'Không thể tạo ảnh trang trí.': {
    en: 'Could not render decorated image.',
    ru: 'Не удалось создать оформленное изображение.',
  },
  'Không thể tạo nền ghép.': {
    en: 'Could not render collage.',
    ru: 'Не удалось создать коллаж.',
  },
  'Không thể mã hóa ảnh.': {
    en: 'Could not encode image.',
    ru: 'Не удалось закодировать изображение.',
  },
  'Nền chỉ nhận PNG, JPG hoặc WebP.': {
    en: 'Backgrounds must be PNG, JPG, or WebP.',
    ru: 'Поддерживаются только фоны PNG, JPG или WebP.',
  },
  'Ảnh nền phải nhỏ hơn 8 MB.': {
    en: 'Background image must be smaller than 8 MB.',
    ru: 'Размер фонового изображения не должен превышать 8 МБ.',
  },
  'Không thể mở bộ nhớ nền.': {
    en: 'Could not open local background storage.',
    ru: 'Не удалось открыть локальное хранилище фонов.',
  },
  'Không thể cập nhật nền.': {
    en: 'Could not update local background storage.',
    ru: 'Не удалось обновить локальное хранилище фонов.',
  },
}

export function normalizeLocale(raw: unknown): Locale | null {
  if (typeof raw !== 'string') return null
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'vi' || normalized.startsWith('vi-')) return 'vi'
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en'
  if (normalized === 'ru' || normalized.startsWith('ru-')) return 'ru'
  return null
}

export function getInitialLocale(search = typeof window !== 'undefined' ? window.location.search : ''): Locale {
  try {
    const queryLang = normalizeLocale(new URLSearchParams(search).get('lang'))
    if (queryLang) return queryLang
  } catch {
    /* Ignore malformed query string. */
  }
  try {
    const stored = normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY))
    if (stored) return stored
  } catch {
    /* Storage may be unavailable in restricted contexts. */
  }
  return 'vi'
}

export function getMessages(locale: Locale): GalleryMessages {
  return MESSAGES_BY_LOCALE[locale]
}

export function getIntlLocaleTag(locale: Locale): string {
  return INTL_LOCALE_TAG[locale]
}

export function getNextLocale(locale: Locale): Locale {
  const index = LOCALE_OPTIONS.findIndex((item) => item.code === locale)
  return LOCALE_OPTIONS[(index + 1) % LOCALE_OPTIONS.length].code
}

export function localizeErrorMessage(message: string, locale: Locale): string {
  if (locale === 'vi') return message
  return ERROR_TRANSLATIONS[message]?.[locale] ?? message
}

export { LOCALE_OPTIONS, type GalleryMessages, type Locale } from './types'
