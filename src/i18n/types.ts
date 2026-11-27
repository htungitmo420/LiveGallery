import type { CollagePattern, StickerCategory } from '../decor'
import type { DiyFilterId, DiyLayoutId } from '../lib/diy/types'

export type Locale = 'vi' | 'en' | 'ru'

export interface LocaleOption {
  code: Locale
  shortLabel: string
  nativeName: string
}

export const LOCALE_OPTIONS: readonly LocaleOption[] = [
  { code: 'vi', shortLabel: 'VI', nativeName: 'Tiếng Việt' },
  { code: 'en', shortLabel: 'EN', nativeName: 'English' },
  { code: 'ru', shortLabel: 'RU', nativeName: 'Русский' },
] as const

export interface GalleryMessages {
  documentTitle: string
  brandHomeAria: string
  languageSwitcherLabel: string
  cycleLanguageAria: (nextLanguageName: string) => string
  theme: {
    toDark: string
    toLight: string
    darkShort: string
    lightShort: string
  }
  landing: {
    privacyNote: string
    heroTitleLine1: string
    heroTitleLine2: string
    heroLead: string
    claimLabel: string
    claimSpec: string
    claimPlaceholder: string
    claimSubmit: string
    claimInvalid: string
    recentTitle: string
    recentHint: string
    recentFrameCount: (count: number) => string
    clearRecent: string
    clearRecentAria: string
    removeRecentAria: (title: string) => string
    diyBadge: string
    diyTitle: string
    diyDesc: string
    diyAction: string
    contactSheetBar: string
    mediaTag: string
    footerBrand: string
    footerMono: string
  }
  status: {
    loadingTitle: string
    loadingDesc: string
    errorCodeSuffix: string
    errorTitle: string
    tryAnotherCode: string
    fallbackLoadError: string
  }
  viewer: {
    backToAlbum: string
    openingDecor: string
    decorateAria: string
    decorateLabel: string
    shareAriaCopied: string
    shareAria: string
    copiedLabel: string
    shareLabel: string
    downloadAria: string
    downloadingLabel: string
    downloadLabel: string
    qrAria: string
    qrLabel: string
    saveAllAria: (count: number) => string
    saveAllLabel: (count: number) => string
    preparingAllLabel: (done: number, total: number) => string
    saveAllSharedNotice: (count: number) => string
    saveAllSharedPartialNotice: (saved: number, skipped: number) => string
    saveAllDownloadedNotice: (count: number) => string
    saveAllError: string
    totalFramesAria: (count: number) => string
    framesUnit: string
    viewerAria: string
    photoKind: string
    prevPhotoAria: string
    nextPhotoAria: string
    fullscreenAria: string
    thumbnailListAria: string
    viewFrameAria: (frame: string) => string
    emptyTitle: string
    emptyDesc: string
    footerHint: string
    openAnotherAlbum: string
    sharedNotice: string
    sharedModalNotice: string
    refreshError: string
    missingPhotoError: string
    downloadError: string
  }
  saveModal: {
    tag: string
    title: string
    closeAria: string
    hintBeforeIos: string
    iosAction: string
    hintBetween: string
    androidAction: string
    hintAfterAndroid: string
    photosApp: string
    retryShare: string
    close: string
  }
  saveAllModal: {
    tag: string
    readyTitle: (count: number) => string
    manualTitle: string
    closeAria: string
    readyHint: (count: number) => string
    skippedNote: (skipped: number) => string
    manualHint: string
    shareNowAction: (count: number) => string
    downloadFallbackAction: (count: number) => string
    copyLinkHintAction: string
    linkCopied: string
    close: string
  }
  qrModal: {
    tag: string
    title: string
    closeAria: string
    qrAlt: (title: string) => string
    hint: string
    copyLink: string
    copiedLink: string
    copyCode: string
    copiedCode: string
  }
  decor: {
    emptyTitle: string
    backToAlbum: string
    studioTitle: string
    back: string
    creating: string
    savePhotoPrefix: string
    savePhotoDesktopSuffix: string
    modeTablistAria: string
    stickersTab: (count: number) => string
    backgroundTab: (count: number) => string
    maxStickersNotice: (max: number) => string
    duplicatedStickerNotice: string
    copiedStickerNotice: string
    pastedStickerNotice: string
    deletedStickerNotice: string
    savedLocalBgNotice: string
    addBgError: string
    creatingHighResNotice: string
    manualSaveNotice: string
    sharedNotice: string
    downloadedNotice: string
    exportError: string
    stripAlt: string
    moveStickerAria: (name: string) => string
    stickerToolbarAria: (name: string) => string
    rotateStickerAria: (name: string) => string
    rotateStickerTitle: string
    flipStickerAria: (name: string) => string
    flipStickerTitle: string
    duplicateStickerAria: (name: string) => string
    duplicateStickerTitle: string
    resizeStickerAria: (name: string) => string
    resizeStickerTitle: string
    deleteStickerAria: (name: string) => string
    deleteStickerTitle: string
    editingSticker: (name: string) => string
    flip: string
    duplicate: string
    delete: string
    done: string
    sizeLabel: string
    rotateLabel: string
    chooseStickerTitle: string
    remoteAndBuiltIn: string
    builtInOnly: string
    clearAll: string
    stickerCategoriesAria: string
    addStickerAria: (name: string) => string
    stickerHelpMobile: string
    stickerHelpDesktop: string
    moveStripAria: string
    selectedStripTitle: string
    bringFront: string
    canvasFormatTitle: string
    colorAndPatternTitle: string
    customBgColorAria: string
    chooseBgColorAria: (color: string) => string
    patterns: Record<CollagePattern, string>
    backgroundImageTitle: string
    addFromDevice: string
    colorOnly: string
    deleteBgAria: (name: string) => string
    arrangeTitle: string
    singleStrip: string
    twoStrips: string
    addCopy: string
    messageLabel: string
    messagePlaceholder: string
    messageColorAria: string
    messagePositionAria: string
    positionTop: string
    positionBottom: string
    categories: Record<'all' | StickerCategory, string>
  }
  diy: {
    studioTag: string
    studioTitle: string
    backHome: string
    openingStudio: string
    decorateAction: string
    saveAction: string
    renderingLabel: string
    stepLayoutTitle: string
    stepPhotosTitle: (filled: number, total: number) => string
    pickPhotosAction: (filled: number, total: number) => string
    clearPhotos: string
    emptySlotLabel: (num: string) => string
    replaceSlotAria: (num: string) => string
    moveLeftAria: (num: string) => string
    moveRightAria: (num: string) => string
    removeSlotAria: (num: string) => string
    stepFramesTitle: string
    framesRemoteTag: string
    framesBuiltinTag: string
    loadingFrames: string
    stepFilterTitle: string
    captionLabel: string
    captionPlaceholder: string
    showDateLabel: string
    needMorePhotosHint: (missing: number, total: number) => string
    readyHint: string
    invalidFileNotice: string
    sharedNotice: string
    downloadedNotice: string
    manualSaveNotice: string
    renderError: string
    syntheticAlbumTitle: string
    backToCompose: string
    previewAria: string
    layouts: Record<DiyLayoutId, { name: string; slotsLabel: string }>
    filters: Record<DiyFilterId, string>
    builtinFrames: Record<string, string>
  }
}
