import type { GalleryMedia, MobilePlatform, SaveAllMediaOutcome, SaveMediaOutcome } from './types'

export function detectMobilePlatform(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  maxTouchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
): MobilePlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios'
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios'
  if (/Android/i.test(userAgent)) return 'android'
  if (/Mobile/i.test(userAgent)) return 'android'
  return 'desktop'
}

export function isMobileDevice(
  userAgent?: string,
  maxTouchPoints?: number,
): boolean {
  return detectMobilePlatform(userAgent, maxTouchPoints) !== 'desktop'
}

export function normalizeMediaFileName(
  fileName: string,
  mimeType: string,
  fallbackBase = 'photo',
): string {
  const cleanMime = mimeType.split(';', 1)[0].trim().toLowerCase()
  const ext = cleanMime === 'image/gif'
    ? 'gif'
    : cleanMime === 'image/png'
      ? 'png'
      : cleanMime === 'video/mp4'
        ? 'mp4'
        : cleanMime === 'video/webm'
          ? 'webm'
          : cleanMime === 'video/quicktime'
            ? 'mov'
            : 'jpg'
  const trimmed = fileName.trim()
  const withoutExt = trimmed ? trimmed.replace(/\.[a-z0-9]+$/i, '') : fallbackBase
  const sanitized = withoutExt
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
  const localizedToEnglish = sanitized
    .replace(/^anh(?=$|[-_])/i, 'photo')
    .replace(/^khoanh[-_]?khac(?=$|[-_])/i, 'photobooth')
  const base = localizedToEnglish || fallbackBase
  return `${base}.${ext}`
}

export function canShareMediaFiles(files: File[]): boolean {
  if (files.length === 0) return false
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return false
  }
  if (typeof navigator.canShare === 'function') {
    try {
      return navigator.canShare({ files })
    } catch {
      return false
    }
  }
  return true
}

export function canShareMediaFile(file: File): boolean {
  return canShareMediaFiles([file])
}

export async function fileToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result)
        else reject(new Error('Không thể tạo bản xem trước ảnh.'))
      }
      reader.onerror = () => reject(new Error('Không thể tạo bản xem trước ảnh.'))
      reader.readAsDataURL(blob)
    })
  }
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  const mime = blob.type || 'image/jpeg'
  return `data:${mime};base64,${btoa(binary)}`
}

export function triggerBrowserDownload(file: File): void {
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.style.display = 'none'
  anchor.href = url
  anchor.download = file.name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function shareMediaFileImmediately(file: File): Promise<boolean> {
  return (await shareMediaFilesImmediately([file])) === 'shared'
}

export async function shareMediaFilesImmediately(
  files: File[],
): Promise<'shared' | 'cancelled' | 'failed'> {
  if (!canShareMediaFiles(files)) return 'failed'
  try {
    // Keep the share payload strictly to { files } so iOS Safari and Android
    // expose "Save X Images" / "Save to Photos".
    await navigator.share({ files })
    return 'shared'
  } catch (error) {
    const errorName = (error as { name?: string } | null)?.name
    if (errorName === 'AbortError') return 'cancelled'
    return 'failed'
  }
}

function ensureUniqueFileNames(files: File[]): File[] {
  const seen = new Set<string>()
  return files.map((file) => {
    const key = file.name.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      return file
    }
    const dotIndex = file.name.lastIndexOf('.')
    const base = dotIndex > 0 ? file.name.slice(0, dotIndex) : file.name
    const ext = dotIndex > 0 ? file.name.slice(dotIndex) : ''
    let counter = 2
    let candidate = `${base}-${String(counter).padStart(2, '0')}${ext}`
    while (seen.has(candidate.toLowerCase())) {
      counter += 1
      candidate = `${base}-${String(counter).padStart(2, '0')}${ext}`
    }
    seen.add(candidate.toLowerCase())
    return new File([file], candidate, {
      type: file.type,
      lastModified: file.lastModified,
    })
  })
}

function selectShareableMediaFiles(files: File[]): { shareable: File[]; skippedCount: number } {
  if (files.length === 0) return { shareable: [], skippedCount: 0 }
  if (canShareMediaFiles(files)) return { shareable: files, skippedCount: 0 }

  // Some mobile browsers reject mixed image+GIF/video batches in navigator.canShare({ files }).
  const stills = files.filter((file) => file.type.startsWith('image/') && file.type !== 'image/gif')
  if (stills.length > 0 && stills.length < files.length && canShareMediaFiles(stills)) {
    return { shareable: stills, skippedCount: files.length - stills.length }
  }

  // Some OS share sheets cap multi-file batches at 10 items.
  if (stills.length > 10) {
    const batch = stills.slice(0, 10)
    if (canShareMediaFiles(batch)) {
      return { shareable: batch, skippedCount: files.length - batch.length }
    }
  }

  return { shareable: [], skippedCount: files.length }
}

export async function triggerStaggeredBrowserDownloads(
  files: File[],
  delayMs = 160,
): Promise<void> {
  for (let index = 0; index < files.length; index += 1) {
    triggerBrowserDownload(files[index])
    if (delayMs > 0 && index < files.length - 1) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, delayMs)
      })
    }
  }
}

export async function saveAllMediaFilesToDevice(
  files: File[],
  options?: { desktopDelayMs?: number },
): Promise<SaveAllMediaOutcome> {
  if (files.length === 0) {
    return { status: 'cancelled', files: [], skippedCount: 0 }
  }

  if (isMobileDevice()) {
    const { shareable, skippedCount } = selectShareableMediaFiles(files)
    if (shareable.length > 0) {
      try {
        await navigator.share({ files: shareable })
        return { status: 'shared', files: shareable, skippedCount }
      } catch (error) {
        const errorName = (error as { name?: string } | null)?.name
        if (errorName === 'AbortError') {
          return { status: 'cancelled', files: shareable, skippedCount }
        }
        return { status: 'ready-to-share', files: shareable, skippedCount }
      }
    }

    return { status: 'manual', files, skippedCount: 0 }
  }

  await triggerStaggeredBrowserDownloads(files, options?.desktopDelayMs ?? 160)
  return { status: 'downloaded', files, skippedCount: 0 }
}

export async function saveMediaFileToDevice(file: File): Promise<SaveMediaOutcome> {
  if (isMobileDevice()) {
    const shareSupported = canShareMediaFile(file)
    if (shareSupported) {
      try {
        // Keep the share payload strictly to { files } so iOS Safari and Android
        // treat the item as media and expose "Save Image" / "Save to Photos".
        await navigator.share({ files: [file] })
        return { status: 'shared', file }
      } catch (error) {
        const errorName = (error as { name?: string } | null)?.name
        if (errorName === 'AbortError') {
          return { status: 'cancelled', file }
        }
        const previewUrl = await fileToDataUrl(file)
        return { status: 'manual', file, previewUrl, canRetryShare: true }
      }
    }

    const previewUrl = await fileToDataUrl(file)
    return { status: 'manual', file, previewUrl, canRetryShare: false }
  }

  triggerBrowserDownload(file)
  return { status: 'downloaded', file }
}

async function convertBlobToJpeg(blob: Blob): Promise<Blob> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return new Blob([blob], { type: 'image/jpeg' })
  }
  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Không thể xử lý định dạng ảnh.'))
      element.src = objectUrl
    })
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) return new Blob([blob], { type: 'image/jpeg' })
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return new Blob([blob], { type: 'image/jpeg' })
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    const converted = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.96),
    )
    return converted ?? new Blob([blob], { type: 'image/jpeg' })
  } catch {
    return new Blob([blob], { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const mediaFileCache = new Map<string, Promise<File>>()

export function clearMediaFileCache(): void {
  mediaFileCache.clear()
}

export async function prepareGalleryMediaFile(
  item: GalleryMedia,
  options?: { bypassCache?: boolean },
): Promise<File> {
  const cacheKey = item.url
  if (!options?.bypassCache) {
    const cached = mediaFileCache.get(cacheKey)
    if (cached) return cached
  }

  const task = (async () => {
    const response = await fetch(
      item.url,
      options?.bypassCache ? { cache: 'no-store' } : undefined,
    )
    if (!response.ok) throw new Error('Liên kết ảnh đã hết hạn.')
    const rawBlob = await response.blob()
    const rawMime = (rawBlob.type || item.mimeType || '').split(';', 1)[0].trim().toLowerCase()

    if (item.kind === 'video' || rawMime.startsWith('video/')) {
      const videoMime = rawMime.startsWith('video/') ? rawMime : 'video/mp4'
      const videoBlob = rawBlob.type === videoMime ? rawBlob : new Blob([rawBlob], { type: videoMime })
      const fileName = normalizeMediaFileName(item.fileName, videoMime, 'moving-strip')
      return new File([videoBlob], fileName, { type: videoMime, lastModified: Date.now() })
    }

    if (item.kind === 'gif' || rawMime === 'image/gif') {
      const gifBlob = rawBlob.type === 'image/gif' ? rawBlob : new Blob([rawBlob], { type: 'image/gif' })
      const fileName = normalizeMediaFileName(item.fileName, 'image/gif', 'photobooth')
      return new File([gifBlob], fileName, { type: 'image/gif', lastModified: Date.now() })
    }

    const jpegBlob = rawMime === 'image/jpeg'
      ? (rawBlob.type === 'image/jpeg' ? rawBlob : new Blob([rawBlob], { type: 'image/jpeg' }))
      : await convertBlobToJpeg(rawBlob)
    const fileName = normalizeMediaFileName(item.fileName, 'image/jpeg', 'photo')
    return new File([jpegBlob], fileName, { type: 'image/jpeg', lastModified: Date.now() })
  })()

  mediaFileCache.set(cacheKey, task)
  task.catch(() => {
    if (mediaFileCache.get(cacheKey) === task) {
      mediaFileCache.delete(cacheKey)
    }
  })

  return task
}

export function preloadGalleryMedia(item: GalleryMedia | undefined): void {
  if (!item) return
  void prepareGalleryMediaFile(item).catch(() => undefined)
}

export async function downloadGalleryMedia(
  item: GalleryMedia,
  options?: { bypassCache?: boolean },
): Promise<SaveMediaOutcome> {
  const file = await prepareGalleryMediaFile(item, options)
  return saveMediaFileToDevice(file)
}

export async function prepareAllGalleryMediaFiles(
  items: readonly GalleryMedia[],
  options?: {
    bypassCache?: boolean
    concurrency?: number
    onProgress?: (completed: number, total: number) => void
  },
): Promise<File[]> {
  const total = items.length
  if (total === 0) return []

  options?.onProgress?.(0, total)
  const results = new Array<File>(total)
  const workerCount = Math.max(1, Math.min(options?.concurrency ?? 4, total))
  let nextIndex = 0
  let completed = 0

  const worker = async () => {
    while (nextIndex < total) {
      const currentIndex = nextIndex
      nextIndex += 1
      const file = await prepareGalleryMediaFile(items[currentIndex], {
        bypassCache: options?.bypassCache,
      })
      results[currentIndex] = file
      completed += 1
      options?.onProgress?.(completed, total)
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return ensureUniqueFileNames(results)
}

export async function downloadAllGalleryMedia(
  items: readonly GalleryMedia[],
  options?: {
    bypassCache?: boolean
    concurrency?: number
    onProgress?: (completed: number, total: number) => void
    desktopDelayMs?: number
  },
): Promise<SaveAllMediaOutcome> {
  const files = await prepareAllGalleryMediaFiles(items, options)
  return saveAllMediaFilesToDevice(files, {
    desktopDelayMs: options?.desktopDelayMs,
  })
}
