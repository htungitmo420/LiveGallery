export type GalleryMediaKind = 'image' | 'gif'

export interface GalleryMedia {
  id: string
  kind: GalleryMediaKind
  url: string
  thumbnailUrl: string | null
  mimeType: string
  fileName: string
  width: number | null
  height: number | null
  durationMs: number | null
  sortOrder: number
}

export interface GalleryStickerAsset {
  id: string
  name: string
  category: string
  url: string
}

export interface GalleryBackgroundAsset {
  id: string
  name: string
  url: string
}

export interface GalleryAlbum {
  shareCode: string
  title: string
  message: string | null
  createdAt: string
  expiresAt: string | null
  items: GalleryMedia[]
  stickers: GalleryStickerAsset[]
  backgrounds: GalleryBackgroundAsset[]
}

export interface ManifestResponse {
  album?: unknown
  items?: unknown
  decor?: unknown
  error?: unknown
}

export type MobilePlatform = 'ios' | 'android' | 'desktop'

export interface SaveMediaOutcome {
  status: 'shared' | 'downloaded' | 'cancelled' | 'manual'
  file: File
  previewUrl?: string
  canRetryShare?: boolean
}

export interface SaveAllMediaOutcome {
  status: 'shared' | 'downloaded' | 'cancelled' | 'ready-to-share' | 'manual'
  files: File[]
  skippedCount: number
}
