import {
  hasControlChars,
  isSafeAlbumR2Path,
  type UploadFileRole,
  type UploadManifestFile,
} from '../_shared/r2.ts'

export const ALBUM_BUCKET = 'photobooth-albums'
export const MAX_REQUEST_BYTES = 60 * 1024 * 1024
export const MAX_FILE_BYTES = 12 * 1024 * 1024
export const MAX_JSON_BODY_BYTES = 64 * 1024
// Upload/HEAD all album files (up to 10-12 files) in a single parallel wave instead of 2 waves.
export const R2_PARALLEL_CONCURRENCY = 12
export const PRESIGNED_PUT_TTL_SECONDS = 300
export const UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000
// High-throughput event ceiling for 150+ continuous guests sharing one venue Wi-Fi IP.
export const UPLOAD_LIMIT_PER_HOUR = 300

export const EXPECTED_PHOTO_COUNTS: Record<string, number[]> = {
  strip3: [3, 6],
  strip4: [4, 8],
  grid4: [4, 8],
  polaroid: [1, 2],
}

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const GIF_MIME_TYPES = ['image/gif']
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const R2_QUOTA_EXCEEDED_ERROR = 'Bộ nhớ lưu trữ ảnh đã đạt giới hạn tối đa. Tạm ngừng nhận album mới.'
export const R2_QUOTA_LOOKUP_ERROR = 'Không thể kiểm tra hạn mức bộ nhớ lưu trữ lúc này.'

export interface ParsedInitFile {
  index: number
  role: UploadFileRole
  name: string
  mimeType: string
  byteSize: number
}

export function isFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0
}

export function normalizeMimeType(value: string): string {
  return value.split(';', 1)[0].trim().toLowerCase()
}

export function validFile(file: File, types: readonly string[]): boolean {
  return file.size > 0 && file.size <= MAX_FILE_BYTES && types.includes(normalizeMimeType(file.type))
}

export function extensionForMime(mimeType: string): string {
  const byType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }
  return byType[normalizeMimeType(mimeType)] || 'bin'
}

export function allowedMimesForRole(role: UploadFileRole): readonly string[] {
  return role === 'gif' ? GIF_MIME_TYPES : IMAGE_MIME_TYPES
}

export function isValidRole(value: unknown): value is UploadFileRole {
  return value === 'strip' || value === 'gif' || value === 'photo'
}

export function buildAlbumShareUrl(galleryBaseUrl: string, shareCode: string): string {
  return `${galleryBaseUrl}/i/${encodeURIComponent(shareCode)}`
}

export function validateInitFiles(
  layoutId: string,
  rawFiles: unknown,
): { ok: true; files: ParsedInitFile[]; totalBytes: number } | { ok: false; error: string; status: number } {
  const allowedPhotoCounts = EXPECTED_PHOTO_COUNTS[layoutId]
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
    if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > MAX_FILE_BYTES) {
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
  if (totalBytes > MAX_REQUEST_BYTES) {
    return { ok: false, error: 'Bộ ảnh vượt quá giới hạn 60 MB.', status: 413 }
  }

  return { ok: true, files: parsed, totalBytes }
}

export function validateCompleteFiles(
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
