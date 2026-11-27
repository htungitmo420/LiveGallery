import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FALLBACK_STICKERS } from '../src/decor'
import {
  LOCALE_OPTIONS,
  LOCALE_STORAGE_KEY,
  getInitialLocale,
  getIntlLocaleTag,
  getMessages,
  getNextLocale,
  localizeErrorMessage,
  normalizeLocale,
} from '../src/i18n/core'
import { localizeStickerName } from '../src/i18n/stickers'
import { formatAlbumDate } from '../src/lib/format'

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() { return store.size },
    clear() { store.clear() },
    getItem(key: string) { return store.get(key) ?? null },
    key(index: number) { return Array.from(store.keys())[index] ?? null },
    removeItem(key: string) { store.delete(key) },
    setItem(key: string, value: string) { store.set(key, value) },
  }
}

describe('LiveGallery i18n', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('normalizes supported locale tags and defaults to Vietnamese', () => {
    expect(LOCALE_OPTIONS.map((item) => item.code)).toEqual(['vi', 'en', 'ru'])
    expect(normalizeLocale('vi')).toBe('vi')
    expect(normalizeLocale('en-US')).toBe('en')
    expect(normalizeLocale('ru-RU')).toBe('ru')
    expect(normalizeLocale('fr')).toBeNull()
    expect(getInitialLocale('')).toBe('vi')
  })

  it('prefers ?lang query parameter over localStorage and persists fallback', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'ru')
    expect(getInitialLocale('')).toBe('ru')
    expect(getInitialLocale('?lang=en')).toBe('en')
    expect(getInitialLocale('?lang=invalid')).toBe('ru')
  })

  it('cycles cleanly through VI -> EN -> RU -> VI', () => {
    expect(getNextLocale('vi')).toBe('en')
    expect(getNextLocale('en')).toBe('ru')
    expect(getNextLocale('ru')).toBe('vi')
  })

  it('provides localized dictionaries, error messages, and date formatting for all locales', () => {
    for (const { code } of LOCALE_OPTIONS) {
      const msg = getMessages(code)
      expect(msg.landing.claimSubmit.length).toBeGreaterThan(0)
      expect(msg.viewer.decorateLabel.length).toBeGreaterThan(0)
      expect(msg.decor.categories.all.length).toBeGreaterThan(0)
      expect(formatAlbumDate('2026-11-27T12:00:00.000Z', code).length).toBeGreaterThan(0)
      expect(getIntlLocaleTag(code)).toMatch(/^[a-z]{2}-[A-Z]{2}$/)
    }

    expect(localizeErrorMessage('Album không tồn tại hoặc đã hết hạn.', 'en')).toBe('Album not found or has expired.')
    expect(localizeErrorMessage('Album không tồn tại hoặc đã hết hạn.', 'ru')).toBe('Альбом не найден или срок его хранения истёк.')
    expect(localizeErrorMessage('Album không tồn tại hoặc đã hết hạn.', 'vi')).toBe('Album không tồn tại hoặc đã hết hạn.')

    for (const sticker of FALLBACK_STICKERS) {
      expect(localizeStickerName(sticker.id, sticker.name, 'en')).not.toBe(sticker.name)
      expect(localizeStickerName(sticker.id, sticker.name, 'ru')).not.toBe(sticker.name)
    }
  })
})
