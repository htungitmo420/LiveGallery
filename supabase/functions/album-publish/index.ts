import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  DEFAULT_ALLOWED_PHOTOBOOTH_ORIGIN,
  R2_STORAGE_PREFIX,
  createR2PresignedPutUrl,
  createUploadToken,
  deleteR2Object,
  hasControlChars,
  hasR2StorageCapacity,
  headR2Object,
  hmacSha256Hex,
  isAllowedOrigin,
  isR2Configured,
  isSafeAlbumR2Path,
  parseAllowedOrigins,
  parseR2MaxStorageBytes,
  putR2Object,
  runWithConcurrency,
  stripR2Prefix,
  verifyUploadToken,
  verifyUploadTokenForAbort,
  type UploadFileRole,
  type UploadManifestFile,
} from '../_shared/r2.ts'

const bucket = 'photobooth-albums'
const defaultGalleryBaseUrl = 'https://livegallery.nhtisitmo.workers.dev'
const maxRequestBytes = 60 * 1024 * 1024
const maxFileBytes = 12 * 1024 * 1024
const maxJsonBodyBytes = 64 * 1024
const uploadConcurrency = 5
const presignedPutTtlSeconds = 300
const uploadTokenTtlMs = 10 * 60 * 1000
// High-throughput event ceiling for 150+ continuous guests sharing one venue Wi-Fi IP.
const uploadLimitPerHour = 300

const expectedPhotoCounts: Record<string, number[]> = {
  strip3: [3, 6],
  strip4: [4, 8],
  grid4: [4, 8],
  polaroid: [1, 2],
}

const imageMimeTypes = ['image/jpeg', 'image/png', 'image/webp']
const gifMimeTypes = ['image/gif']
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const textEncoder = new TextEncoder()

function resolveGalleryBaseUrl(): string {
  const raw = Deno.env.get('LIVE_GALLERY_URL')?.trim()
  if (!raw) {
    console.warn('LIVE_GALLERY_URL is not set; falling back to default gallery URL.')
    return defaultGalleryBaseUrl
  }
  try {
    const parsed = new URL(raw)
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
    if (parsed.protocol === 'https:' || (isLocal && parsed.protocol === 'http:')) {
      return raw.replace(/\/+$/, '')
    }
  } catch {
    /* Fall back to default URL when env is malformed. */
  }
  return defaultGalleryBaseUrl
}

function getAllowedOrigins(): string[] {
  return parseAllowedOrigins(Deno.env.get('ALLOWED_PHOTOBOOTH_ORIGINS'), DEFAULT_ALLOWED_PHOTOBOOTH_ORIGIN)
}

function cors(origin: string | null, allowedOrigins: readonly string[]) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin, allowedOrigins) ? origin! : allowedOrigins[0],
    'Access-Control-Allow-Headers': 'apikey, content-type, x-client-info, x-photobooth-client',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
  }
}

function json(body: unknown, status: number, origin: string | null, allowedOrigins: readonly string[]) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(origin, allowedOrigins),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function isFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0
}

function normalizeMimeType(value: string): string {
  return value.split(';', 1)[0].trim().toLowerCase()
}

function validFile(file: File, types: readonly string[]): boolean {
  return file.size > 0 && file.size <= maxFileBytes && types.includes(normalizeMimeType(file.type))
}

function extensionForMime(mimeType: string): string {
  const byType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }
  return byType[normalizeMimeType(mimeType)] || 'bin'
}

function allowedMimesForRole(role: UploadFileRole): readonly string[] {
  return role === 'gif' ? gifMimeTypes : imageMimeTypes
}

function isValidRole(value: unknown): value is UploadFileRole {
  return value === 'strip' || value === 'gif' || value === 'photo'
}

async function hashClient(request: Request, secret: string): Promise<string> {
  const address = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown'
  return hmacSha256Hex(textEncoder.encode(secret), `khoanhkhac:client-ip:v1:${address}`)
}

async function cleanupR2Keys(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return
  await runWithConcurrency(keys, uploadConcurrency, async (key) => {
    await deleteR2Object(key).catch(() => undefined)
  })
}

function buildAlbumShareUrl(galleryBaseUrl: string, shareCode: string): string {
  return `${galleryBaseUrl}/i/${encodeURIComponent(shareCode)}`
}

interface ParsedInitFile {
  index: number
  role: UploadFileRole
  name: string
  mimeType: string
  byteSize: number
}

function validateInitFiles(
  layoutId: string,
  rawFiles: unknown,
): { ok: true; files: ParsedInitFile[]; totalBytes: number } | { ok: false; error: string; status: number } {
  const allowedPhotoCounts = expectedPhotoCounts[layoutId]
  if (!allowedPhotoCounts) {
    return { ok: false, error: 'Bố cục ảnh không hợp lệ.', status: 400 }
  }
  if (!Array.isArray(rawFiles) || rawFiles.length < 3 || rawFiles.length > 12) {
    return { ok: false, error: 'Danh sách tệp ảnh không hợp lệ.', status: 400 }
  }

  let stripCount = 0
  let gifCount = 0
  let photoCount = 0
  let totalBytes = 0
  const parsed: ParsedInitFile[] = []

  for (let index = 0; index < rawFiles.length; index += 1) {
    const entry = rawFiles[index]
    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: 'Dữ liệu tệp không hợp lệ.', status: 400 }
    }
    const record = entry as Record<string, unknown>
    if (!isValidRole(record.role)) {
      return { ok: false, error: 'Loại tệp không hợp lệ.', status: 400 }
    }
    const mimeType = typeof record.mimeType === 'string' ? normalizeMimeType(record.mimeType) : ''
    if (!allowedMimesForRole(record.role).includes(mimeType)) {
      return { ok: false, error: 'Định dạng ảnh không được hỗ trợ.', status: 400 }
    }
    const byteSize = typeof record.byteSize === 'number' ? record.byteSize : Number.NaN
    if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > maxFileBytes) {
      return { ok: false, error: 'Dung lượng tệp vượt quá giới hạn cho phép.', status: 400 }
    }

    const normalizedByteSize = Math.trunc(byteSize)
    totalBytes += normalizedByteSize
    const ext = extensionForMime(mimeType)
    let canonicalName: string
    if (record.role === 'strip') {
      stripCount += 1
      canonicalName = `photobooth.${ext}`
    } else if (record.role === 'gif') {
      gifCount += 1
      canonicalName = 'khoanh-khac.gif'
    } else {
      photoCount += 1
      canonicalName = `anh-${String(photoCount).padStart(2, '0')}.${ext}`
    }

    parsed.push({
      index,
      role: record.role,
      name: canonicalName,
      mimeType,
      byteSize: normalizedByteSize,
    })
  }

  if (stripCount !== 1 || gifCount !== 1 || !allowedPhotoCounts.includes(photoCount)) {
    return { ok: false, error: 'Số lượng ảnh không khớp với bố cục.', status: 400 }
  }
  if (totalBytes > maxRequestBytes) {
    return { ok: false, error: 'Bộ ảnh vượt quá giới hạn 60 MB.', status: 413 }
  }

  return { ok: true, files: parsed, totalBytes }
}

function validateCompleteFiles(
  albumId: string,
  rawFiles: unknown,
): { ok: true; files: UploadManifestFile[] } | { ok: false; error: string } {
  if (!Array.isArray(rawFiles) || rawFiles.length < 3 || rawFiles.length > 12) {
    return { ok: false, error: 'Danh sách tệp hoàn tất không hợp lệ.' }
  }

  const seenIndices = new Set<number>()
  const seenPaths = new Set<string>()
  const validated: UploadManifestFile[] = []

  for (const entry of rawFiles) {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: 'Thông tin tệp không hợp lệ.' }
    }
    const record = entry as Record<string, unknown>
    const index = typeof record.index === 'number' ? record.index : Number.NaN
    const role = record.role
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    const mimeType = typeof record.mimeType === 'string' ? normalizeMimeType(record.mimeType) : ''
    const storagePath = typeof record.storagePath === 'string' ? record.storagePath.trim() : ''

    if (!Number.isInteger(index) || index < 0 || index >= rawFiles.length || seenIndices.has(index)) {
      return { ok: false, error: 'Thứ tự tệp không hợp lệ.' }
    }
    if (!isValidRole(role) || !allowedMimesForRole(role).includes(mimeType)) {
      return { ok: false, error: 'Định dạng tệp không hợp lệ.' }
    }
    if (!name || name.length > 120 || name.includes('/') || name.includes('\\') || hasControlChars(name)) {
      return { ok: false, error: 'Tên tệp không hợp lệ.' }
    }
    if (!isSafeAlbumR2Path(storagePath, albumId) || seenPaths.has(storagePath)) {
      return { ok: false, error: 'Đường dẫn lưu trữ không hợp lệ.' }
    }

    seenIndices.add(index)
    seenPaths.add(storagePath)
    validated.push({ index, role, name, mimeType, storagePath })
  }

  return { ok: true, files: validated.sort((a, b) => a.index - b.index) }
}

async function checkRateLimit(
  admin: ReturnType<typeof createClient>,
  clientHash: string,
): Promise<{ allowed: boolean; lookupFailed: boolean }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error } = await admin
    .from('photobooth_album_upload_events')
    .select('id', { count: 'exact', head: true })
    .eq('client_hash', clientHash)
    .gte('created_at', oneHourAgo)
  if (error) {
    console.error('Rate limit lookup failed')
    return { allowed: false, lookupFailed: true }
  }
  return { allowed: (count ?? 0) < uploadLimitPerHour, lookupFailed: false }
}

const r2QuotaExceededError = 'Bộ nhớ lưu trữ ảnh đã đạt giới hạn tối đa. Tạm ngừng nhận album mới.'
const r2QuotaLookupError = 'Không thể kiểm tra hạn mức bộ nhớ lưu trữ lúc này.'

async function checkR2StorageQuota(
  admin: ReturnType<typeof createClient>,
  incomingBytes: number,
): Promise<{ allowed: boolean; lookupFailed: boolean }> {
  const maxBytes = parseR2MaxStorageBytes(Deno.env.get('R2_MAX_STORAGE_BYTES'))
  if (maxBytes <= 0) {
    return { allowed: false, lookupFailed: false }
  }
  const { data, error } = await admin.rpc('get_active_r2_storage_bytes')
  if (error) {
    console.error('R2 storage quota lookup failed')
    return { allowed: false, lookupFailed: true }
  }
  const usedBytes = typeof data === 'number' ? data : Number(data)
  if (!Number.isFinite(usedBytes) || usedBytes < 0) {
    console.error('R2 storage quota returned invalid byte count')
    return { allowed: false, lookupFailed: true }
  }
  return {
    allowed: hasR2StorageCapacity(usedBytes, incomingBytes, maxBytes),
    lookupFailed: false,
  }
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin')
  const allowedOrigins = getAllowedOrigins()

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: cors(origin, allowedOrigins) })
  }
  if (request.method !== 'POST') {
    return json({ error: 'Phương thức không được hỗ trợ.' }, 405, origin, allowedOrigins)
  }
  if (!isAllowedOrigin(origin, allowedOrigins) || request.headers.get('x-photobooth-client') !== 'web-v1') {
    return json({ error: 'Nguồn tải lên không được phép.' }, 403, origin, allowedOrigins)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Máy chủ album chưa được cấu hình.' }, 500, origin, allowedOrigins)
  }

  const galleryBaseUrl = resolveGalleryBaseUrl()
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const baseContentType = normalizeMimeType(request.headers.get('content-type') || '')

  // Flow A: JSON R2 Direct Parallel Upload (init / complete / abort)
  if (baseContentType === 'application/json') {
    const contentLength = Number(request.headers.get('content-length') || '0')
    if (Number.isFinite(contentLength) && contentLength > maxJsonBodyBytes) {
      return json({ error: 'Yêu cầu vượt quá kích thước cho phép.' }, 413, origin, allowedOrigins)
    }

    let rawText: string
    try {
      rawText = await request.text()
    } catch {
      return json({ error: 'Dữ liệu yêu cầu không hợp lệ.' }, 400, origin, allowedOrigins)
    }
    if (textEncoder.encode(rawText).byteLength > maxJsonBodyBytes) {
      return json({ error: 'Yêu cầu vượt quá kích thước cho phép.' }, 413, origin, allowedOrigins)
    }

    let body: unknown
    try {
      body = JSON.parse(rawText)
    } catch {
      return json({ error: 'Dữ liệu JSON không hợp lệ.' }, 400, origin, allowedOrigins)
    }
    if (!body || typeof body !== 'object') {
      return json({ error: 'Dữ liệu yêu cầu không hợp lệ.' }, 400, origin, allowedOrigins)
    }

    const payload = body as Record<string, unknown>
    const action = typeof payload.action === 'string' ? payload.action : ''

    if (action === 'init') {
      if (!isR2Configured()) {
        return json({ mode: 'multipart' }, 200, origin, allowedOrigins)
      }

      const clientHash = await hashClient(request, serviceRoleKey)
      const rate = await checkRateLimit(admin, clientHash)
      if (rate.lookupFailed) {
        return json({ error: 'Không thể bắt đầu tải album.' }, 500, origin, allowedOrigins)
      }
      if (!rate.allowed) {
        return json({ error: 'Thiết bị đã tạo quá nhiều album. Hãy thử lại sau một giờ.' }, 429, origin, allowedOrigins)
      }

      const layoutId = typeof payload.layoutId === 'string' ? payload.layoutId : ''
      const title = typeof payload.title === 'string' ? payload.title.trim().slice(0, 120) : ''
      const message = typeof payload.message === 'string' ? payload.message.trim().slice(0, 500) : ''
      const validation = validateInitFiles(layoutId, payload.files)
      if (!validation.ok) {
        return json({ error: validation.error }, validation.status, origin, allowedOrigins)
      }

      const storageQuota = await checkR2StorageQuota(admin, validation.totalBytes)
      if (storageQuota.lookupFailed) {
        return json({ error: r2QuotaLookupError }, 503, origin, allowedOrigins)
      }
      if (!storageQuota.allowed) {
        return json({ error: r2QuotaExceededError }, 507, origin, allowedOrigins)
      }

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      const { data: album, error: albumError } = await admin
        .from('photobooth_albums')
        .insert({
          title: title || 'Khoảnh khắc của bạn',
          message: message || null,
          status: 'draft',
          expires_at: expiresAt,
        })
        .select('id, share_code')
        .single()

      if (albumError || !album) {
        console.error('Album draft creation failed')
        return json({ error: 'Không thể tạo album.' }, 500, origin, allowedOrigins)
      }

      // Charge rate-limit quota immediately when minting draft + presigned PUT URLs
      // (ON DELETE SET NULL keeps this event row even if the draft is later aborted).
      const { error: eventError } = await admin
        .from('photobooth_album_upload_events')
        .insert({ client_hash: clientHash, album_id: album.id })
      if (eventError) {
        console.error('Upload event logging failed during init')
        await admin.from('photobooth_albums').delete().eq('id', album.id).eq('status', 'draft')
        return json({ error: 'Không thể khởi tạo phiên tải album.' }, 500, origin, allowedOrigins)
      }

      try {
        const planned = validation.files.map((file) => {
          const objectKey = `${album.id}/${crypto.randomUUID()}.${extensionForMime(file.mimeType)}`
          return {
            ...file,
            objectKey,
            storagePath: `${R2_STORAGE_PREFIX}${objectKey}`,
          }
        })

        const uploads = await Promise.all(planned.map(async (item) => {
          const putUrl = await createR2PresignedPutUrl({
            key: item.objectKey,
            contentType: item.mimeType,
            contentLength: item.byteSize,
            expiresInSeconds: presignedPutTtlSeconds,
          })
          return {
            index: item.index,
            role: item.role,
            name: item.name,
            mimeType: item.mimeType,
            putUrl,
            storagePath: item.storagePath,
          }
        }))

        const manifestFiles: UploadManifestFile[] = uploads.map((item) => ({
          index: item.index,
          role: item.role,
          name: item.name,
          mimeType: item.mimeType,
          storagePath: item.storagePath,
        }))

        const { token: uploadToken } = await createUploadToken({
          albumId: album.id,
          shareCode: album.share_code,
          files: manifestFiles,
          secret: serviceRoleKey,
          ttlMs: uploadTokenTtlMs,
        })

        return json({
          mode: 'r2-direct',
          albumId: album.id,
          shareCode: album.share_code,
          url: buildAlbumShareUrl(galleryBaseUrl, album.share_code),
          uploadToken,
          uploads,
        }, 200, origin, allowedOrigins)
      } catch {
        console.error('R2 presign init failed')
        await admin.from('photobooth_albums').delete().eq('id', album.id).eq('status', 'draft')
        return json({ error: 'Không thể khởi tạo phiên tải album.' }, 500, origin, allowedOrigins)
      }
    }

    if (action === 'complete') {
      if (!isR2Configured()) {
        return json({ error: 'Bộ nhớ lưu trữ ảnh chưa được cấu hình.' }, 500, origin, allowedOrigins)
      }

      const albumId = typeof payload.albumId === 'string' ? payload.albumId.trim() : ''
      const uploadToken = typeof payload.uploadToken === 'string' ? payload.uploadToken.trim() : ''
      if (!uuidPattern.test(albumId) || !uploadToken) {
        return json({ error: 'Phiên tải album không hợp lệ.' }, 400, origin, allowedOrigins)
      }

      const fileValidation = validateCompleteFiles(albumId, payload.files)
      if (!fileValidation.ok) {
        return json({ error: fileValidation.error }, 400, origin, allowedOrigins)
      }
      const submittedFiles = fileValidation.files

      const { data: album, error: lookupError } = await admin
        .from('photobooth_albums')
        .select('id, share_code, status')
        .eq('id', albumId)
        .maybeSingle()

      if (lookupError) {
        console.error('Album lookup failed during complete')
        return json({ error: 'Không thể hoàn tất tải album.' }, 500, origin, allowedOrigins)
      }
      if (!album || album.status !== 'draft') {
        return json({ error: 'Phiên tải album không hợp lệ hoặc đã hết hạn.' }, 403, origin, allowedOrigins)
      }

      const tokenValid = await verifyUploadToken({
        token: uploadToken,
        albumId: album.id,
        shareCode: album.share_code,
        files: submittedFiles,
        secret: serviceRoleKey,
      })
      if (!tokenValid) {
        return json({ error: 'Phiên tải album không hợp lệ hoặc đã hết hạn.' }, 403, origin, allowedOrigins)
      }

      const objectKeys = submittedFiles.map((file) => stripR2Prefix(file.storagePath))
      let verifiedSizes: number[]
      let totalActualBytes = 0
      try {
        const headResults = await runWithConcurrency(submittedFiles, uploadConcurrency, async (file) => {
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
            || head.contentLength > maxFileBytes
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

        if (invalidUpload || totalActualBytes > maxRequestBytes) {
          await cleanupR2Keys(objectKeys)
          await admin.from('photobooth_albums').delete().eq('id', album.id).eq('status', 'draft')
          return json({ error: 'Tệp ảnh chưa được tải lên đầy đủ hoặc không hợp lệ.' }, 400, origin, allowedOrigins)
        }
      } catch {
        console.error('R2 HEAD verification failed')
        await cleanupR2Keys(objectKeys)
        await admin.from('photobooth_albums').delete().eq('id', album.id).eq('status', 'draft')
        return json({ error: 'Không thể xác minh tệp ảnh đã tải lên.' }, 400, origin, allowedOrigins)
      }

      const completeQuota = await checkR2StorageQuota(admin, totalActualBytes)
      if (completeQuota.lookupFailed || !completeQuota.allowed) {
        await cleanupR2Keys(objectKeys)
        await admin.from('photobooth_albums').delete().eq('id', album.id).eq('status', 'draft')
        return json(
          { error: completeQuota.lookupFailed ? r2QuotaLookupError : r2QuotaExceededError },
          completeQuota.lookupFailed ? 503 : 507,
          origin,
          allowedOrigins,
        )
      }

      try {
        const assets = submittedFiles.map((file, idx) => ({
          album_id: album.id,
          kind: file.role === 'gif' ? 'gif' : 'image',
          storage_path: file.storagePath,
          mime_type: file.mimeType,
          file_name: file.name,
          sort_order: file.index,
          byte_size: verifiedSizes[idx],
        }))

        const { error: assetError } = await admin.from('photobooth_album_assets').insert(assets)
        if (assetError) {
          if (assetError.code === '23505') {
            return json({ error: 'Album đang được hoàn tất.' }, 409, origin, allowedOrigins)
          }
          throw assetError
        }

        const { data: published, error: publishError } = await admin
          .from('photobooth_albums')
          .update({ status: 'published', updated_at: new Date().toISOString() })
          .eq('id', album.id)
          .eq('status', 'draft')
          .select('id')
          .maybeSingle()
        if (publishError || !published) throw publishError ?? new Error('Draft already finalized.')
      } catch {
        console.error('Album finalize failed')
        const { data: deletedDraft } = await admin
          .from('photobooth_albums')
          .delete()
          .eq('id', album.id)
          .eq('status', 'draft')
          .select('id')
          .maybeSingle()
        if (deletedDraft) {
          await cleanupR2Keys(objectKeys)
        }
        return json({ error: 'Không thể xuất bản album. Hãy thử lại.' }, 500, origin, allowedOrigins)
      }

      return json({
        shareCode: album.share_code,
        url: buildAlbumShareUrl(galleryBaseUrl, album.share_code),
      }, 201, origin, allowedOrigins)
    }

    if (action === 'abort') {
      const albumId = typeof payload.albumId === 'string' ? payload.albumId.trim() : ''
      const uploadToken = typeof payload.uploadToken === 'string' ? payload.uploadToken.trim() : ''
      if (!uuidPattern.test(albumId) || !uploadToken) {
        return json({ error: 'Phiên hủy tải album không hợp lệ.' }, 400, origin, allowedOrigins)
      }

      const { data: album, error: lookupError } = await admin
        .from('photobooth_albums')
        .select('id, share_code, status')
        .eq('id', albumId)
        .maybeSingle()

      if (lookupError) {
        console.error('Album lookup failed during abort')
        return json({ error: 'Không thể hủy phiên tải album.' }, 500, origin, allowedOrigins)
      }
      if (!album || album.status !== 'draft') {
        return json({ error: 'Phiên hủy tải album không hợp lệ.' }, 403, origin, allowedOrigins)
      }

      const tokenValid = await verifyUploadTokenForAbort({
        token: uploadToken,
        albumId: album.id,
        shareCode: album.share_code,
        secret: serviceRoleKey,
      })
      if (!tokenValid) {
        return json({ error: 'Phiên hủy tải album không hợp lệ.' }, 403, origin, allowedOrigins)
      }

      const { data: deletedDraft } = await admin
        .from('photobooth_albums')
        .delete()
        .eq('id', album.id)
        .eq('status', 'draft')
        .select('id')
        .maybeSingle()

      if (deletedDraft && isR2Configured() && Array.isArray(payload.storagePaths)) {
        const safeKeys = Array.from(new Set(
          payload.storagePaths
            .slice(0, 20)
            .filter((entry): entry is string => typeof entry === 'string' && isSafeAlbumR2Path(entry, album.id))
            .map((entry) => stripR2Prefix(entry)),
        ))
        await cleanupR2Keys(safeKeys)
      }

      return json({ aborted: Boolean(deletedDraft) }, 200, origin, allowedOrigins)
    }

    return json({ error: 'Hành động không được hỗ trợ.' }, 400, origin, allowedOrigins)
  }

  // Flow B: Parallel Multipart Fallback (backwards compatible)
  if (baseContentType !== 'multipart/form-data') {
    return json({ error: 'Định dạng dữ liệu tải lên không được hỗ trợ.' }, 415, origin, allowedOrigins)
  }

  const contentLength = Number(request.headers.get('content-length') || '0')
  if (Number.isFinite(contentLength) && contentLength > maxRequestBytes) {
    return json({ error: 'Bộ ảnh vượt quá giới hạn 60 MB.' }, 413, origin, allowedOrigins)
  }

  const clientHash = await hashClient(request, serviceRoleKey)
  const rate = await checkRateLimit(admin, clientHash)
  if (rate.lookupFailed) {
    return json({ error: 'Không thể bắt đầu tải album.' }, 500, origin, allowedOrigins)
  }
  if (!rate.allowed) {
    return json({ error: 'Thiết bị đã tạo quá nhiều album. Hãy thử lại sau một giờ.' }, 429, origin, allowedOrigins)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json({ error: 'Dữ liệu tải lên không hợp lệ.' }, 400, origin, allowedOrigins)
  }

  const layoutId = String(form.get('layoutId') || '')
  const allowedPhotoCounts = expectedPhotoCounts[layoutId]
  const title = String(form.get('title') || '').trim().slice(0, 120)
  const message = String(form.get('message') || '').trim().slice(0, 500)
  const strip = form.get('strip')
  const loopGif = form.get('loopGif')
  const photos = form.getAll('photos').filter(isFile)

  if (!allowedPhotoCounts || !allowedPhotoCounts.includes(photos.length)) {
    return json({ error: 'Số lượng ảnh không khớp với bố cục.' }, 400, origin, allowedOrigins)
  }
  if (!isFile(strip) || !validFile(strip, imageMimeTypes)) {
    return json({ error: 'Ảnh photobooth không hợp lệ.' }, 400, origin, allowedOrigins)
  }
  if (!isFile(loopGif) || !validFile(loopGif, gifMimeTypes)) {
    return json({ error: 'Ảnh động không hợp lệ.' }, 400, origin, allowedOrigins)
  }
  if (photos.some((photo) => !validFile(photo, imageMimeTypes))) {
    return json({ error: 'Một hoặc nhiều ảnh chụp không hợp lệ.' }, 400, origin, allowedOrigins)
  }

  const totalBytes = [strip, loopGif, ...photos].reduce((sum, file) => sum + file.size, 0)
  if (totalBytes > maxRequestBytes) {
    return json({ error: 'Bộ ảnh vượt quá giới hạn 60 MB.' }, 413, origin, allowedOrigins)
  }

  const useR2 = isR2Configured()
  if (useR2) {
    const storageQuota = await checkR2StorageQuota(admin, totalBytes)
    if (storageQuota.lookupFailed) {
      return json({ error: r2QuotaLookupError }, 503, origin, allowedOrigins)
    }
    if (!storageQuota.allowed) {
      return json({ error: r2QuotaExceededError }, 507, origin, allowedOrigins)
    }
  }

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: album, error: albumError } = await admin
    .from('photobooth_albums')
    .insert({
      title: title || 'Khoảnh khắc của bạn',
      message: message || null,
      status: 'draft',
      expires_at: expiresAt,
    })
    .select('id, share_code')
    .single()
  if (albumError || !album) {
    console.error('Album creation failed')
    return json({ error: 'Không thể tạo album.' }, 500, origin, allowedOrigins)
  }

  const files: Array<{ file: File; kind: 'image' | 'gif'; name: string }> = [
    { file: strip, kind: 'image', name: `photobooth.${extensionForMime(strip.type)}` },
    { file: loopGif, kind: 'gif', name: 'khoanh-khac.gif' },
    ...photos.map((photo, index) => ({
      file: photo,
      kind: 'image' as const,
      name: `anh-${String(index + 1).padStart(2, '0')}.${extensionForMime(photo.type)}`,
    })),
  ]

  const uploadedR2Keys: string[] = []
  const uploadedSupabasePaths: string[] = []

  try {
    const assets = await runWithConcurrency(files, uploadConcurrency, async (item, index) => {
      const mimeType = normalizeMimeType(item.file.type)
      const objectKey = `${album.id}/${crypto.randomUUID()}.${extensionForMime(mimeType)}`
      let storagePath: string

      if (useR2) {
        await putR2Object({
          key: objectKey,
          body: item.file,
          contentType: mimeType,
          cacheControl: 'public, max-age=3600',
        })
        uploadedR2Keys.push(objectKey)
        storagePath = `${R2_STORAGE_PREFIX}${objectKey}`
      } else {
        const { error: uploadError } = await admin.storage.from(bucket).upload(objectKey, item.file, {
          contentType: mimeType,
          cacheControl: '3600',
          upsert: false,
        })
        if (uploadError) throw uploadError
        uploadedSupabasePaths.push(objectKey)
        storagePath = objectKey
      }

      return {
        album_id: album.id,
        kind: item.kind,
        storage_path: storagePath,
        mime_type: mimeType,
        file_name: item.name,
        sort_order: index,
        byte_size: item.file.size,
      }
    })

    const { error: assetError } = await admin.from('photobooth_album_assets').insert(assets)
    if (assetError) throw assetError

    const { error: publishError } = await admin
      .from('photobooth_albums')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', album.id)
      .eq('status', 'draft')
    if (publishError) throw publishError

    await admin.from('photobooth_album_upload_events').insert({ client_hash: clientHash, album_id: album.id })
  } catch {
    console.error('Multipart album upload failed')
    await Promise.allSettled([
      cleanupR2Keys(uploadedR2Keys),
      uploadedSupabasePaths.length ? admin.storage.from(bucket).remove(uploadedSupabasePaths) : Promise.resolve(),
    ])
    await admin.from('photobooth_albums').delete().eq('id', album.id).eq('status', 'draft')
    return json({ error: 'Tải album thất bại. Hãy thử lại.' }, 500, origin, allowedOrigins)
  }

  return json({
    shareCode: album.share_code,
    url: buildAlbumShareUrl(galleryBaseUrl, album.share_code),
  }, 201, origin, allowedOrigins)
})
