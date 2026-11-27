import {
  R2_STORAGE_PREFIX,
  createR2PresignedPutUrl,
  createUploadToken,
  headR2Object,
  isR2Configured,
  isSafeAlbumR2Path,
  parseR2MaxStorageBytes,
  putR2Object,
  runWithConcurrency,
  stripR2Prefix,
  verifyUploadToken,
  verifyUploadTokenForAbort,
  type UploadManifestFile,
} from '../_shared/r2.ts'
import {
  postgrestRpc,
  removeStorageObjects,
  uploadStorageObject,
} from '../_shared/supabase-rest.ts'
import {
  beginAlbumUpload,
  cleanupR2Keys,
  ctxJson,
  deleteDraftAlbum,
  hashClient,
  loadDraftAlbum,
  textEncoder,
  type PublishContext,
} from './http.ts'
import {
  ALBUM_BUCKET,
  EXPECTED_PHOTO_COUNTS,
  GIF_MIME_TYPES,
  IMAGE_MIME_TYPES,
  MAX_FILE_BYTES,
  MAX_JSON_BODY_BYTES,
  MAX_REQUEST_BYTES,
  PRESIGNED_PUT_TTL_SECONDS,
  R2_PARALLEL_CONCURRENCY,
  R2_QUOTA_EXCEEDED_ERROR,
  UPLOAD_TOKEN_TTL_MS,
  UUID_PATTERN,
  VIDEO_MIME_TYPES,
  buildAlbumShareUrl,
  extensionForMime,
  isFile,
  normalizeMimeType,
  validFile,
  validateCompleteFiles,
  validateInitFiles,
} from './validation.ts'

async function handleJsonInit(
  request: Request,
  payload: Record<string, unknown>,
  ctx: PublishContext,
): Promise<Response> {
  if (!isR2Configured()) {
    return ctxJson(ctx, { mode: 'multipart' }, 200)
  }

  const maxR2Bytes = parseR2MaxStorageBytes(Deno.env.get('R2_MAX_STORAGE_BYTES'))
  if (maxR2Bytes <= 0) {
    return ctxJson(ctx, { error: R2_QUOTA_EXCEEDED_ERROR }, 507)
  }

  // Validate payload before touching the database.
  const layoutId = typeof payload.layoutId === 'string' ? payload.layoutId : ''
  const title = typeof payload.title === 'string' ? payload.title.trim().slice(0, 120) : ''
  const message = typeof payload.message === 'string' ? payload.message.trim().slice(0, 500) : ''
  const validation = validateInitFiles(layoutId, payload.files)
  if (!validation.ok) {
    return ctxJson(ctx, { error: validation.error }, validation.status)
  }

  const clientHash = await hashClient(request, ctx.serviceRoleKey)
  const begun = await beginAlbumUpload(ctx, {
    clientHash,
    title,
    message,
    totalBytes: validation.totalBytes,
    maxR2Bytes,
    useR2: true,
    logContext: 'init',
  })
  if (!begun.ok) return begun.response

  const { albumId, shareCode, durationMs: dbDuration } = begun

  try {
    const signStart = performance.now()
    const planned = validation.files.map((file) => {
      const objectKey = `${albumId}/${crypto.randomUUID()}.${extensionForMime(file.mimeType)}`
      return {
        ...file,
        objectKey,
        storagePath: `${R2_STORAGE_PREFIX}${objectKey}`,
      }
    })

    const manifestFiles: UploadManifestFile[] = planned.map((item) => ({
      index: item.index,
      role: item.role,
      name: item.name,
      mimeType: item.mimeType,
      storagePath: item.storagePath,
    }))

    const [uploads, tokenBundle] = await Promise.all([
      Promise.all(planned.map(async (item) => {
        const putUrl = await createR2PresignedPutUrl({
          key: item.objectKey,
          contentType: item.mimeType,
          contentLength: item.byteSize,
          expiresInSeconds: PRESIGNED_PUT_TTL_SECONDS,
        })
        return {
          index: item.index,
          role: item.role,
          name: item.name,
          mimeType: item.mimeType,
          putUrl,
          storagePath: item.storagePath,
        }
      })),
      createUploadToken({
        albumId,
        shareCode,
        files: manifestFiles,
        secret: ctx.serviceRoleKey,
        ttlMs: UPLOAD_TOKEN_TTL_MS,
      }),
    ])
    const signDuration = performance.now() - signStart
    const totalDuration = performance.now() - ctx.startedAt

    return ctxJson(
      ctx,
      {
        mode: 'r2-direct',
        albumId,
        shareCode,
        url: buildAlbumShareUrl(ctx.galleryBaseUrl, shareCode),
        uploadToken: tokenBundle.token,
        uploads,
      },
      200,
      {
        'Server-Timing': `db-init;dur=${dbDuration.toFixed(1)}, sign;dur=${signDuration.toFixed(1)}, total;dur=${totalDuration.toFixed(1)}`,
      },
    )
  } catch {
    console.error('R2 presign init failed')
    await deleteDraftAlbum(ctx.dbConfig, albumId)
    return ctxJson(ctx, { error: 'Không thể khởi tạo phiên tải album.' }, 500)
  }
}

async function handleJsonComplete(
  payload: Record<string, unknown>,
  ctx: PublishContext,
): Promise<Response> {
  if (!isR2Configured()) {
    return ctxJson(ctx, { error: 'Bộ nhớ lưu trữ ảnh chưa được cấu hình.' }, 500)
  }

  const albumId = typeof payload.albumId === 'string' ? payload.albumId.trim() : ''
  const uploadToken = typeof payload.uploadToken === 'string' ? payload.uploadToken.trim() : ''
  if (!UUID_PATTERN.test(albumId) || !uploadToken) {
    return ctxJson(ctx, { error: 'Phiên tải album không hợp lệ.' }, 400)
  }

  const fileValidation = validateCompleteFiles(albumId, payload.files)
  if (!fileValidation.ok) {
    return ctxJson(ctx, { error: fileValidation.error }, 400)
  }
  const submittedFiles = fileValidation.files

  const draft = await loadDraftAlbum(ctx, albumId, {
    logContext: 'complete',
    lookupError: 'Không thể hoàn tất tải album.',
    invalidError: 'Phiên tải album không hợp lệ hoặc đã hết hạn.',
  })
  if (!draft.ok) return draft.response

  const { album, durationMs: lookupDuration } = draft
  const tokenValid = await verifyUploadToken({
    token: uploadToken,
    albumId: album.id,
    shareCode: album.share_code,
    files: submittedFiles,
    secret: ctx.serviceRoleKey,
  })
  if (!tokenValid) {
    return ctxJson(ctx, { error: 'Phiên tải album không hợp lệ hoặc đã hết hạn.' }, 403)
  }

  const objectKeys = submittedFiles.map((file) => stripR2Prefix(file.storagePath))
  let verifiedSizes: number[]
  let totalActualBytes = 0
  const headStart = performance.now()
  try {
    const headResults = await runWithConcurrency(submittedFiles, R2_PARALLEL_CONCURRENCY, async (file) => {
      const head = await headR2Object(stripR2Prefix(file.storagePath))
      return { file, head }
    })

    verifiedSizes = []
    let invalidUpload = false

    for (const { file, head } of headResults) {
      if (
        !head.exists
        || head.contentLength === null
        || head.contentLength <= 0
        || head.contentLength > MAX_FILE_BYTES
      ) {
        invalidUpload = true
        break
      }
      if (!head.contentType || head.contentType !== file.mimeType) {
        invalidUpload = true
        break
      }
      totalActualBytes += head.contentLength
      verifiedSizes.push(head.contentLength)
    }

    if (invalidUpload || totalActualBytes > MAX_REQUEST_BYTES) {
      await Promise.allSettled([cleanupR2Keys(objectKeys), deleteDraftAlbum(ctx.dbConfig, album.id)])
      return ctxJson(ctx, { error: 'Tệp ảnh chưa được tải lên đầy đủ hoặc không hợp lệ.' }, 400)
    }
  } catch {
    console.error('R2 HEAD verification failed')
    await Promise.allSettled([cleanupR2Keys(objectKeys), deleteDraftAlbum(ctx.dbConfig, album.id)])
    return ctxJson(ctx, { error: 'Không thể xác minh tệp ảnh đã tải lên.' }, 400)
  }
  const headDuration = performance.now() - headStart

  const maxR2Bytes = parseR2MaxStorageBytes(Deno.env.get('R2_MAX_STORAGE_BYTES'))
  const assets = submittedFiles.map((file, idx) => ({
    kind: file.role === 'video' ? 'video' : file.role === 'gif' ? 'gif' : 'image',
    storage_path: file.storagePath,
    mime_type: file.mimeType,
    file_name: file.name,
    sort_order: file.index,
    byte_size: verifiedSizes[idx],
  }))

  // Single atomic RPC: re-check 9.5 GB hard cap + insert assets + publish album.
  const finalizeStart = performance.now()
  const finalizeResult = await postgrestRpc<string>(ctx.dbConfig, 'finalize_album_publish', {
    p_album_id: album.id,
    p_assets: assets,
    p_incoming_bytes: totalActualBytes,
    p_max_r2_bytes: maxR2Bytes,
  })
  const finalizeDuration = performance.now() - finalizeStart

  if (finalizeResult.error) {
    console.error('finalize_album_publish RPC failed during complete')
    const deleted = await deleteDraftAlbum(ctx.dbConfig, album.id)
    if (deleted) await cleanupR2Keys(objectKeys)
    return ctxJson(ctx, { error: 'Không thể xuất bản album. Hãy thử lại.' }, 500)
  }

  if (finalizeResult.data === 'quota_exceeded') {
    const deleted = await deleteDraftAlbum(ctx.dbConfig, album.id)
    if (deleted) await cleanupR2Keys(objectKeys)
    return ctxJson(ctx, { error: R2_QUOTA_EXCEEDED_ERROR }, 507)
  }
  if (finalizeResult.data === 'conflict') {
    return ctxJson(ctx, { error: 'Album đang được hoàn tất.' }, 409)
  }
  if (finalizeResult.data !== 'ok') {
    return ctxJson(ctx, { error: 'Phiên tải album không hợp lệ hoặc đã hết hạn.' }, 403)
  }

  const totalDuration = performance.now() - ctx.startedAt
  return ctxJson(
    ctx,
    {
      shareCode: album.share_code,
      url: buildAlbumShareUrl(ctx.galleryBaseUrl, album.share_code),
    },
    201,
    {
      'Server-Timing': `db-lookup;dur=${lookupDuration.toFixed(1)}, r2-head;dur=${headDuration.toFixed(1)}, db-finalize;dur=${finalizeDuration.toFixed(1)}, total;dur=${totalDuration.toFixed(1)}`,
    },
  )
}

async function handleJsonAbort(
  payload: Record<string, unknown>,
  ctx: PublishContext,
): Promise<Response> {
  const albumId = typeof payload.albumId === 'string' ? payload.albumId.trim() : ''
  const uploadToken = typeof payload.uploadToken === 'string' ? payload.uploadToken.trim() : ''
  if (!UUID_PATTERN.test(albumId) || !uploadToken) {
    return ctxJson(ctx, { error: 'Phiên hủy tải album không hợp lệ.' }, 400)
  }

  const draft = await loadDraftAlbum(ctx, albumId, {
    logContext: 'abort',
    lookupError: 'Không thể hủy phiên tải album.',
    invalidError: 'Phiên hủy tải album không hợp lệ.',
  })
  if (!draft.ok) return draft.response

  const { album } = draft
  const tokenValid = await verifyUploadTokenForAbort({
    token: uploadToken,
    albumId: album.id,
    shareCode: album.share_code,
    secret: ctx.serviceRoleKey,
  })
  if (!tokenValid) {
    return ctxJson(ctx, { error: 'Phiên hủy tải album không hợp lệ.' }, 403)
  }

  const deletedDraft = await deleteDraftAlbum(ctx.dbConfig, album.id)
  if (deletedDraft && isR2Configured() && Array.isArray(payload.storagePaths)) {
    const safeKeys = Array.from(new Set(
      payload.storagePaths
        .slice(0, 20)
        .filter((entry): entry is string => typeof entry === 'string' && isSafeAlbumR2Path(entry, album.id))
        .map((entry) => stripR2Prefix(entry)),
    ))
    await cleanupR2Keys(safeKeys)
  }

  return ctxJson(ctx, { aborted: deletedDraft }, 200)
}

export async function handleJsonPublish(
  request: Request,
  ctx: PublishContext,
): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') || '0')
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    return ctxJson(ctx, { error: 'Yêu cầu vượt quá kích thước cho phép.' }, 413)
  }

  let rawText: string
  try {
    rawText = await request.text()
  } catch {
    return ctxJson(ctx, { error: 'Dữ liệu yêu cầu không hợp lệ.' }, 400)
  }
  if (textEncoder.encode(rawText).byteLength > MAX_JSON_BODY_BYTES) {
    return ctxJson(ctx, { error: 'Yêu cầu vượt quá kích thước cho phép.' }, 413)
  }

  let body: unknown
  try {
    body = JSON.parse(rawText)
  } catch {
    return ctxJson(ctx, { error: 'Dữ liệu JSON không hợp lệ.' }, 400)
  }
  if (!body || typeof body !== 'object') {
    return ctxJson(ctx, { error: 'Dữ liệu yêu cầu không hợp lệ.' }, 400)
  }

  const payload = body as Record<string, unknown>
  const action = typeof payload.action === 'string' ? payload.action : ''

  if (action === 'init') return handleJsonInit(request, payload, ctx)
  if (action === 'complete') return handleJsonComplete(payload, ctx)
  if (action === 'abort') return handleJsonAbort(payload, ctx)
  return ctxJson(ctx, { error: 'Hành động không được hỗ trợ.' }, 400)
}

export async function handleMultipartPublish(
  request: Request,
  ctx: PublishContext,
): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') || '0')
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return ctxJson(ctx, { error: 'Bộ ảnh vượt quá giới hạn 60 MB.' }, 413)
  }

  const useR2 = isR2Configured()
  const maxR2Bytes = useR2 ? parseR2MaxStorageBytes(Deno.env.get('R2_MAX_STORAGE_BYTES')) : null
  if (useR2 && maxR2Bytes !== null && maxR2Bytes <= 0) {
    return ctxJson(ctx, { error: R2_QUOTA_EXCEEDED_ERROR }, 507)
  }

  // Start reading multipart body immediately alongside client IP hashing (no DB stall before reading body).
  const parseStart = performance.now()
  let form: FormData
  let clientHash: string
  try {
    ;[form, clientHash] = await Promise.all([
      request.formData(),
      hashClient(request, ctx.serviceRoleKey),
    ])
  } catch {
    return ctxJson(ctx, { error: 'Dữ liệu tải lên không hợp lệ.' }, 400)
  }
  const parseDuration = performance.now() - parseStart

  const layoutId = String(form.get('layoutId') || '')
  const allowedPhotoCounts = EXPECTED_PHOTO_COUNTS[layoutId]
  const title = String(form.get('title') || '').trim().slice(0, 120)
  const message = String(form.get('message') || '').trim().slice(0, 500)
  const strip = form.get('strip')
  const loopGif = form.get('loopGif')
  const movingVideo = form.get('movingVideo')
  const photos = form.getAll('photos').filter(isFile)

  if (!allowedPhotoCounts || !allowedPhotoCounts.includes(photos.length)) {
    return ctxJson(ctx, { error: 'Số lượng ảnh không khớp với bố cục.' }, 400)
  }
  if (!isFile(strip) || !validFile(strip, IMAGE_MIME_TYPES)) {
    return ctxJson(ctx, { error: 'Ảnh photobooth không hợp lệ.' }, 400)
  }
  const validGif = isFile(loopGif) ? loopGif : null
  if (validGif && !validFile(validGif, GIF_MIME_TYPES)) {
    return ctxJson(ctx, { error: 'Ảnh động không hợp lệ.' }, 400)
  }
  const validVideo = isFile(movingVideo) ? movingVideo : null
  if (validVideo && !validFile(validVideo, VIDEO_MIME_TYPES)) {
    return ctxJson(ctx, { error: 'Video chuyển động không hợp lệ.' }, 400)
  }
  if (photos.some((photo) => !validFile(photo, IMAGE_MIME_TYPES))) {
    return ctxJson(ctx, { error: 'Một hoặc nhiều ảnh chụp không hợp lệ.' }, 400)
  }

  const totalBytes = [
    strip,
    ...(validGif ? [validGif] : []),
    ...(validVideo ? [validVideo] : []),
    ...photos,
  ].reduce((sum, file) => sum + file.size, 0)
  if (totalBytes > MAX_REQUEST_BYTES) {
    return ctxJson(ctx, { error: 'Bộ ảnh vượt quá giới hạn 60 MB.' }, 413)
  }

  const begun = await beginAlbumUpload(ctx, {
    clientHash,
    title,
    message,
    totalBytes,
    maxR2Bytes,
    useR2,
    logContext: 'multipart',
  })
  if (!begun.ok) return begun.response

  const { albumId, shareCode, durationMs: dbInitDuration } = begun
  const files: Array<{ file: File; kind: 'image' | 'gif' | 'video'; name: string }> = [
    { file: strip, kind: 'image', name: `photobooth.${extensionForMime(strip.type)}` },
    ...(validGif ? [{ file: validGif, kind: 'gif' as const, name: 'photobooth.gif' }] : []),
    ...(validVideo
      ? [{ file: validVideo, kind: 'video' as const, name: `moving-strip.${extensionForMime(validVideo.type)}` }]
      : []),
    ...photos.map((photo, index) => ({
      file: photo,
      kind: 'image' as const,
      name: `photo-${String(index + 1).padStart(2, '0')}.${extensionForMime(photo.type)}`,
    })),
  ]

  const uploadedR2Keys: string[] = []
  const uploadedSupabasePaths: string[] = []

  const uploadStart = performance.now()
  let assets: Array<{
    kind: 'image' | 'gif' | 'video'
    storage_path: string
    mime_type: string
    file_name: string
    sort_order: number
    byte_size: number
  }>

  try {
    assets = await runWithConcurrency(files, R2_PARALLEL_CONCURRENCY, async (item, index) => {
      const mimeType = normalizeMimeType(item.file.type)
      const objectKey = `${albumId}/${crypto.randomUUID()}.${extensionForMime(mimeType)}`
      let storagePath: string

      if (useR2) {
        await putR2Object({
          key: objectKey,
          body: item.file,
          contentType: mimeType,
          cacheControl: 'private, max-age=3600, immutable',
        })
        uploadedR2Keys.push(objectKey)
        storagePath = `${R2_STORAGE_PREFIX}${objectKey}`
      } else {
        const uploaded = await uploadStorageObject(ctx.dbConfig, ALBUM_BUCKET, objectKey, item.file, mimeType, '3600')
        if (uploaded.error) throw new Error(uploaded.error.message)
        uploadedSupabasePaths.push(objectKey)
        storagePath = objectKey
      }

      return {
        kind: item.kind,
        storage_path: storagePath,
        mime_type: mimeType,
        file_name: item.name,
        sort_order: index,
        byte_size: item.file.size,
      }
    })
  } catch {
    console.error('Multipart album upload failed')
    await Promise.allSettled([
      cleanupR2Keys(uploadedR2Keys),
      removeStorageObjects(ctx.dbConfig, ALBUM_BUCKET, uploadedSupabasePaths),
      deleteDraftAlbum(ctx.dbConfig, albumId),
    ])
    return ctxJson(ctx, { error: 'Tải album thất bại. Hãy thử lại.' }, 500)
  }
  const uploadDuration = performance.now() - uploadStart

  // Single atomic RPC: re-check R2 cap (if R2) + insert assets + publish album.
  const dbFinalizeStart = performance.now()
  const finalizeResult = await postgrestRpc<string>(ctx.dbConfig, 'finalize_album_publish', {
    p_album_id: albumId,
    p_assets: assets,
    p_incoming_bytes: totalBytes,
    p_max_r2_bytes: maxR2Bytes,
  })
  const dbFinalizeDuration = performance.now() - dbFinalizeStart

  if (finalizeResult.error || finalizeResult.data !== 'ok') {
    console.error('Multipart album finalize failed')
    await Promise.allSettled([
      cleanupR2Keys(uploadedR2Keys),
      removeStorageObjects(ctx.dbConfig, ALBUM_BUCKET, uploadedSupabasePaths),
      deleteDraftAlbum(ctx.dbConfig, albumId),
    ])
    if (finalizeResult.data === 'quota_exceeded') {
      return ctxJson(ctx, { error: R2_QUOTA_EXCEEDED_ERROR }, 507)
    }
    return ctxJson(ctx, { error: 'Tải album thất bại. Hãy thử lại.' }, 500)
  }

  const totalDuration = performance.now() - ctx.startedAt
  return ctxJson(
    ctx,
    {
      shareCode,
      url: buildAlbumShareUrl(ctx.galleryBaseUrl, shareCode),
    },
    201,
    {
      'Server-Timing': `parse;dur=${parseDuration.toFixed(1)}, db-init;dur=${dbInitDuration.toFixed(1)}, upload;dur=${uploadDuration.toFixed(1)}, db-finalize;dur=${dbFinalizeDuration.toFixed(1)}, total;dur=${totalDuration.toFixed(1)}`,
    },
  )
}
