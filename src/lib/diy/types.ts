import type { GalleryBackgroundAsset, GalleryStickerAsset } from '../gallery'

export type DiyLayoutId = 'strip3' | 'strip4' | 'grid4' | 'polaroid'

export type DiyFilterId = 'original' | 'mono' | 'warm' | 'cool' | 'vintage' | 'soft'

export interface DiyLayout {
  id: DiyLayoutId
  slots: number
  width: number
  height: number
  kind: 'strip' | 'grid' | 'polaroid'
}

export interface DiyFrameConfig {
  background: string
  accent: string
  textColor: string
  radius: number
}

export interface DiyFrame {
  id: string
  name: string
  description: string
  config: DiyFrameConfig
  assetUrl?: string
  layoutId?: DiyLayoutId
  assetWidth?: number
  assetHeight?: number
  source: 'remote' | 'builtin'
}

export interface DiySlotRect {
  x: number
  y: number
  width: number
  height: number
}

export interface DiyLocalPhoto {
  id: string
  url: string
  name: string
}

export interface DiyCatalog {
  frames: DiyFrame[]
  stickers: GalleryStickerAsset[]
  backgrounds: GalleryBackgroundAsset[]
  remote: boolean
}
