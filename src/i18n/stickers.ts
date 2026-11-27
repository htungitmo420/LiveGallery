import type { Locale } from './types'

const STICKER_NAMES: Record<string, { en: string; ru: string }> = {
  'emoji-cute-rabbit': { en: 'Rabbit', ru: 'Кролик' },
  'emoji-cute-bear': { en: 'Teddy bear', ru: 'Мишка' },
  'emoji-cute-bow': { en: 'Ribbon bow', ru: 'Бантик' },
  'emoji-cute-heart': { en: 'Heart', ru: 'Сердце' },
  'emoji-cute-chick': { en: 'Chick', ru: 'Цыплёнок' },
  'emoji-cute-cat': { en: 'Cat', ru: 'Котёнок' },
  'emoji-cute-flower-face': { en: 'Cherry blossom', ru: 'Сакура' },
  'emoji-cute-sparkle-heart': { en: 'Sparkling heart', ru: 'Сияющее сердце' },
  'emoji-nature-clover': { en: 'Four-leaf clover', ru: 'Клевер' },
  'emoji-nature-flower': { en: 'Daisy', ru: 'Ромашка' },
  'emoji-nature-cherry': { en: 'Cherries', ru: 'Вишня' },
  'emoji-nature-leaf': { en: 'Leaf', ru: 'Лист' },
  'emoji-nature-sun': { en: 'Sun', ru: 'Солнце' },
  'emoji-nature-rainbow': { en: 'Rainbow', ru: 'Радуга' },
  'emoji-nature-cloud': { en: 'Cloud', ru: 'Облако' },
  'emoji-nature-butterfly': { en: 'Butterfly', ru: 'Бабочка' },
  'emoji-lucky-mushroom': { en: 'Mushroom', ru: 'Гриб' },
  'emoji-lucky-dice': { en: 'Dice', ru: 'Кубик' },
  'emoji-lucky-horseshoe': { en: 'Magnet', ru: 'Магнит' },
  'emoji-lucky-crystal': { en: 'Diamond', ru: 'Бриллиант' },
  'emoji-lucky-key': { en: 'Old key', ru: 'Ключ' },
  'emoji-lucky-eight-ball': { en: '8-Ball', ru: 'Шар 8' },
  'emoji-lucky-red-envelope': { en: 'Lucky envelope', ru: 'Конверт удачи' },
  'emoji-lucky-fortune': { en: 'Fortune cookie', ru: 'Печенье удачи' },
  'emoji-retro-camera': { en: 'Camera', ru: 'Камера' },
  'emoji-retro-cassette': { en: 'Cassette', ru: 'Кассета' },
  'emoji-retro-disc': { en: 'CD disc', ru: 'Диск CD' },
  'emoji-retro-game': { en: 'Gamepad', ru: 'Геймпад' },
  'emoji-retro-phone': { en: 'Retro phone', ru: 'Ретро-телефон' },
  'emoji-retro-glasses': { en: 'Sunglasses', ru: 'Очки' },
  'emoji-retro-roller': { en: 'Roller skate', ru: 'Ролик' },
  'emoji-retro-lightning': { en: 'Lightning', ru: 'Молния' },
}

export function localizeStickerName(id: string, fallbackName: string, locale: Locale): string {
  if (locale === 'vi') return fallbackName
  return STICKER_NAMES[id]?.[locale] ?? fallbackName
}
