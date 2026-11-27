import { normalizeMediaFileName, prepareGalleryMediaFile, type GalleryMedia } from './gallery'

export function selectStoryVideoMimeType(isSupported: (mimeType: string) => boolean): string {
  return [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc1.4D401E',
    'video/mp4;codecs=h264',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ].find(isSupported) ?? ''
}

/**
 * Exports a Moving PhotoStrip video ready for TikTok / Instagram Story (9:16 vertical MP4).
 * Uses hardware-backed canvas recording to frame the Moving Strip onto a 720×1280 darkroom
 * Story canvas as MP4 (or falls back cleanly to the original moving-strip video file).
 */
export async function exportStoryVideoFile(
  videoItem: GalleryMedia,
  albumTitle: string,
): Promise<File> {
  const originalFile = await prepareGalleryMediaFile(videoItem)

  const canRenderStory =
    typeof document !== 'undefined'
    && typeof MediaRecorder !== 'undefined'
    && typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function'

  if (!canRenderStory) {
    return originalFile
  }

  const preferredMime = selectStoryVideoMimeType(MediaRecorder.isTypeSupported.bind(MediaRecorder))
  // If browser cannot record MP4 and original file is ALREADY MP4, prefer keeping direct MP4 for iOS/TikTok compatibility
  if (!preferredMime.startsWith('video/mp4') && originalFile.type === 'video/mp4') {
    return originalFile
  }

  const objectUrl = URL.createObjectURL(originalFile)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = objectUrl

  try {
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error('Không thể đọc video chuyển động.'))
      }
      const cleanup = () => {
        video.removeEventListener('loadeddata', onReady)
        video.removeEventListener('error', onError)
      }
      video.addEventListener('loadeddata', onReady, { once: true })
      video.addEventListener('error', onError, { once: true })
      video.load()
    })

    const sourceWidth = video.videoWidth || 1080
    const sourceHeight = video.videoHeight || 1920
    const canvas = document.createElement('canvas')
    canvas.width = 1080
    canvas.height = 1920
    const ctx = canvas.getContext('2d')
    if (!ctx) return originalFile
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const stream = canvas.captureStream(30)
    const recorder = new MediaRecorder(
      stream,
      preferredMime
        ? { mimeType: preferredMime, videoBitsPerSecond: 6_500_000 }
        : { videoBitsPerSecond: 6_500_000 },
    )
    const chunks: BlobPart[] = []
    const stopped = new Promise<void>((resolve) => {
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      })
      recorder.addEventListener('stop', () => resolve(), { once: true })
      recorder.addEventListener('error', () => resolve(), { once: true })
    })

    const maxWidth = canvas.width * 0.8
    const maxHeight = canvas.height * 0.78
    const fitScale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight)
    const drawW = Math.round(sourceWidth * fitScale)
    const drawH = Math.round(sourceHeight * fitScale)
    const drawX = Math.round((canvas.width - drawW) / 2)
    const drawY = Math.round((canvas.height - drawH) / 2 - 34)

    const paintFrame = () => {
      ctx.fillStyle = '#0f0e0c'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Subtle darkroom archival mat frame around the moving strip
      ctx.strokeStyle = 'rgba(229, 169, 60, 0.38)'
      ctx.lineWidth = 3
      ctx.strokeRect(drawX - 12, drawY - 12, drawW + 24, drawH + 24)

      ctx.drawImage(video, drawX, drawY, drawW, drawH)

      ctx.fillStyle = '#f3efe6'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '700 38px "Playfair Display", Georgia, serif'
      ctx.fillText(albumTitle.slice(0, 42), canvas.width / 2, canvas.height - 142, canvas.width * 0.84)

      ctx.fillStyle = '#e5a93c'
      ctx.font = '600 20px "JetBrains Mono", monospace'
      ctx.fillText('35MM LIVE STRIP · KHOẢNH KHẮC', canvas.width / 2, canvas.height - 86)
    }

    let rafId = 0
    const renderLoop = () => {
      paintFrame()
      if (!video.ended && !video.paused) {
        rafId = requestAnimationFrame(renderLoop)
      }
    }

    video.currentTime = 0
    paintFrame()
    recorder.start(200)
    await video.play()
    renderLoop()

    const maxDurationMs = Math.min(12_000, Math.max(2000, Math.round((video.duration || 4.5) * 1000) + 350))
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, maxDurationMs)
      video.addEventListener(
        'ended',
        () => {
          window.clearTimeout(timer)
          resolve()
        },
        { once: true },
      )
    })

    cancelAnimationFrame(rafId)
    paintFrame()
    if (recorder.state !== 'inactive') recorder.stop()
    await stopped
    stream.getTracks().forEach((track) => track.stop())

    const resolvedMime = (recorder.mimeType || preferredMime || 'video/mp4').split(';', 1)[0].trim().toLowerCase()
    const storyBlob = new Blob(chunks, { type: resolvedMime })
    if (storyBlob.size === 0) return originalFile
    const fileName = normalizeMediaFileName('moving-strip-story', resolvedMime, 'moving-strip-story')
    return new File([storyBlob], fileName, { type: resolvedMime, lastModified: Date.now() })
  } catch {
    return originalFile
  } finally {
    video.pause()
    video.removeAttribute('src')
    URL.revokeObjectURL(objectUrl)
  }
}
