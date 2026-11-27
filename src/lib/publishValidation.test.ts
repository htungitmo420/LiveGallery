import { describe, expect, it } from 'vitest'
import {
  MAX_FILE_BYTES,
  validateCompleteFiles,
  validateInitFiles,
} from '../../supabase/functions/album-publish/validation.ts'

const ALBUM_ID = '550e8400-e29b-41d4-a716-446655440000'
const FILE_1 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
const FILE_2 = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'
const FILE_3 = '6ba7b812-9dad-11d1-80b4-00c04fd430c8'

describe('album-publish payload validation', () => {
  it('validates init payloads and assigns canonical filenames by role', () => {
    const result = validateInitFiles('polaroid', [
      { role: 'strip', mimeType: 'image/jpeg; charset=binary', byteSize: 500_000 },
      { role: 'gif', mimeType: 'image/gif', byteSize: 800_000 },
      { role: 'photo', mimeType: 'image/webp', byteSize: 300_000 },
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.totalBytes).toBe(1_600_000)
    expect(result.files.map((item) => item.name)).toEqual([
      'photobooth.jpg',
      'khoanh-khac.gif',
      'anh-01.webp',
    ])
  })

  it('rejects mismatched photo counts, unsupported MIME types, and oversized albums', () => {
    const badCount = validateInitFiles('strip4', [
      { role: 'strip', mimeType: 'image/jpeg', byteSize: 100 },
      { role: 'gif', mimeType: 'image/gif', byteSize: 100 },
      { role: 'photo', mimeType: 'image/jpeg', byteSize: 100 },
    ])
    expect(badCount).toEqual({
      ok: false,
      error: 'Số lượng ảnh không khớp với bố cục.',
      status: 400,
    })

    const badMime = validateInitFiles('polaroid', [
      { role: 'strip', mimeType: 'image/svg+xml', byteSize: 100 },
      { role: 'gif', mimeType: 'image/gif', byteSize: 100 },
      { role: 'photo', mimeType: 'image/jpeg', byteSize: 100 },
    ])
    expect(badMime).toEqual({
      ok: false,
      error: 'Định dạng ảnh không được hỗ trợ.',
      status: 400,
    })

    const tooLarge = validateInitFiles('strip4', [
      { role: 'strip', mimeType: 'image/jpeg', byteSize: MAX_FILE_BYTES },
      { role: 'gif', mimeType: 'image/gif', byteSize: MAX_FILE_BYTES },
      { role: 'photo', mimeType: 'image/jpeg', byteSize: MAX_FILE_BYTES },
      { role: 'photo', mimeType: 'image/jpeg', byteSize: MAX_FILE_BYTES },
      { role: 'photo', mimeType: 'image/jpeg', byteSize: MAX_FILE_BYTES },
      { role: 'photo', mimeType: 'image/jpeg', byteSize: MAX_FILE_BYTES },
    ])
    expect(tooLarge).toEqual({
      ok: false,
      error: 'Bộ ảnh vượt quá giới hạn 60 MB.',
      status: 413,
    })
  })

  it('validates complete payloads, sorts by index, and blocks cross-album storage paths', () => {
    const valid = validateCompleteFiles(ALBUM_ID, [
      { index: 2, role: 'photo', name: 'anh-01.jpg', mimeType: 'image/jpeg', storagePath: `r2:${ALBUM_ID}/${FILE_3}.jpg` },
      { index: 0, role: 'strip', name: 'photobooth.jpg', mimeType: 'image/jpeg', storagePath: `r2:${ALBUM_ID}/${FILE_1}.jpg` },
      { index: 1, role: 'gif', name: 'khoanh-khac.gif', mimeType: 'image/gif', storagePath: `r2:${ALBUM_ID}/${FILE_2}.gif` },
    ])
    expect(valid.ok).toBe(true)
    if (valid.ok) {
      expect(valid.files.map((item) => item.index)).toEqual([0, 1, 2])
    }

    const crossAlbum = validateCompleteFiles(ALBUM_ID, [
      { index: 0, role: 'strip', name: 'photobooth.jpg', mimeType: 'image/jpeg', storagePath: `r2:11111111-1111-1111-1111-111111111111/${FILE_1}.jpg` },
      { index: 1, role: 'gif', name: 'khoanh-khac.gif', mimeType: 'image/gif', storagePath: `r2:${ALBUM_ID}/${FILE_2}.gif` },
      { index: 2, role: 'photo', name: 'anh-01.jpg', mimeType: 'image/jpeg', storagePath: `r2:${ALBUM_ID}/${FILE_3}.jpg` },
    ])
    expect(crossAlbum).toEqual({
      ok: false,
      error: 'Đường dẫn lưu trữ không hợp lệ.',
    })
  })
})
