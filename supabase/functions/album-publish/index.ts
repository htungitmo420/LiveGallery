import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const bucket = 'photobooth-albums'
const galleryBaseUrl = (Deno.env.get('LIVE_GALLERY_URL') || 'https://livegallery.nhtisitmo.workers.dev').replace(/\/$/, '')
const maxRequestBytes = 60 * 1024 * 1024
const maxFileBytes = 12 * 1024 * 1024
const uploadLimitPerHour = 12

const expectedPhotoCount: Record<string, number> = {
  strip3: 6,
  strip4: 8,
  grid4: 8,
  polaroid: 2,
}

function allowedOrigin(origin: string | null) {
  if (!origin) return false
  try {
    const url = new URL(origin)
    return url.origin === 'https://photobooth-itmo.vercel.app'
      || ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && (url.protocol === 'http:' || url.protocol === 'https:'))
  } catch {
    return false
  }
}

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(origin) ? origin! : 'https://photobooth-itmo.vercel.app',
    'Access-Control-Allow-Headers': 'apikey, content-type, x-client-info, x-photobooth-client',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function isFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0
}

function baseMimeType(file: File) {
  return file.type.split(';', 1)[0].trim().toLowerCase()
}

function validFile(file: File, types: string[]) {
  return file.size <= maxFileBytes && types.includes(baseMimeType(file))
}

function extension(file: File) {
  const byType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/webm': 'webm',
    'video/mp4': 'mp4',
  }
  return byType[baseMimeType(file)] || 'bin'
}

async function hashClient(request: Request, secret: string) {
  const address = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown'
  const bytes = new TextEncoder().encode(`${secret}:${address}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin')
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (request.method !== 'POST') return json({ error: 'Phương thức không được hỗ trợ.' }, 405, origin)
  if (!allowedOrigin(origin) || request.headers.get('x-photobooth-client') !== 'web-v1') {
    return json({ error: 'Nguồn tải lên không được phép.' }, 403, origin)
  }

  const contentLength = Number(request.headers.get('content-length') || '0')
  if (contentLength > maxRequestBytes) return json({ error: 'Bộ ảnh vượt quá giới hạn 60 MB.' }, 413, origin)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Máy chủ album chưa được cấu hình.' }, 500, origin)
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const clientHash = await hashClient(request, serviceRoleKey)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error: rateError } = await admin
    .from('photobooth_album_upload_events')
    .select('id', { count: 'exact', head: true })
    .eq('client_hash', clientHash)
    .gte('created_at', oneHourAgo)
  if (rateError) {
    console.error('Rate limit lookup failed', rateError)
    return json({ error: 'Không thể bắt đầu tải album.' }, 500, origin)
  }
  if ((count ?? 0) >= uploadLimitPerHour) {
    return json({ error: 'Thiết bị đã tạo quá nhiều album. Hãy thử lại sau một giờ.' }, 429, origin)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json({ error: 'Dữ liệu tải lên không hợp lệ.' }, 400, origin)
  }

  const layoutId = String(form.get('layoutId') || '')
  const requiredPhotos = expectedPhotoCount[layoutId]
  const title = String(form.get('title') || '').trim().slice(0, 120)
  const message = String(form.get('message') || '').trim().slice(0, 500)
  const strip = form.get('strip')
  const loopGif = form.get('loopGif')
  const loopVideo = form.get('loopVideo')
  const photos = form.getAll('photos').filter(isFile)

  if (!requiredPhotos || photos.length !== requiredPhotos) {
    return json({ error: 'Số lượng ảnh không khớp với bố cục.' }, 400, origin)
  }
  if (!isFile(strip) || !validFile(strip, ['image/jpeg', 'image/png', 'image/webp'])) {
    return json({ error: 'Ảnh photobooth không hợp lệ.' }, 400, origin)
  }
  if (!isFile(loopGif) || !validFile(loopGif, ['image/gif'])) {
    return json({ error: 'Ảnh động không hợp lệ.' }, 400, origin)
  }
  if (loopVideo !== null && (!isFile(loopVideo) || !validFile(loopVideo, ['video/webm', 'video/mp4']))) {
    return json({ error: 'Video chuyển động không hợp lệ.' }, 400, origin)
  }
  if (photos.some((photo) => !validFile(photo, ['image/jpeg', 'image/png', 'image/webp']))) {
    return json({ error: 'Một hoặc nhiều ảnh chụp không hợp lệ.' }, 400, origin)
  }

  const totalBytes = [strip, loopGif, ...(isFile(loopVideo) ? [loopVideo] : []), ...photos]
    .reduce((sum, file) => sum + file.size, 0)
  if (totalBytes > maxRequestBytes) return json({ error: 'Bộ ảnh vượt quá giới hạn 60 MB.' }, 413, origin)

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: album, error: albumError } = await admin
    .from('photobooth_albums')
    .insert({ title: title || 'Khoảnh khắc của bạn', message: message || null, status: 'draft', expires_at: expiresAt })
    .select('id, share_code')
    .single()
  if (albumError || !album) {
    console.error('Album creation failed', albumError)
    return json({ error: 'Không thể tạo album.' }, 500, origin)
  }

  const files: Array<{ file: File; kind: 'image' | 'gif' | 'video'; name: string }> = [
    { file: strip, kind: 'image', name: `photobooth.${extension(strip)}` },
    { file: loopGif, kind: 'gif', name: 'khoanh-khac.gif' },
    ...(isFile(loopVideo) ? [{ file: loopVideo, kind: 'video' as const, name: `khoanh-khac.${extension(loopVideo)}` }] : []),
    ...photos.map((photo, index) => ({ file: photo, kind: 'image' as const, name: `anh-${String(index + 1).padStart(2, '0')}.${extension(photo)}` })),
  ]
  const uploadedPaths: string[] = []

  try {
    const assets = []
    for (let index = 0; index < files.length; index += 1) {
      const item = files[index]
      const storagePath = `${album.id}/${crypto.randomUUID()}.${extension(item.file)}`
      const { error: uploadError } = await admin.storage.from(bucket).upload(storagePath, item.file, {
        contentType: baseMimeType(item.file),
        cacheControl: '3600',
        upsert: false,
      })
      if (uploadError) throw uploadError
      uploadedPaths.push(storagePath)
      assets.push({
        album_id: album.id,
        kind: item.kind,
        storage_path: storagePath,
        mime_type: baseMimeType(item.file),
        file_name: item.name,
        sort_order: index,
        byte_size: item.file.size,
      })
    }

    const { error: assetError } = await admin.from('photobooth_album_assets').insert(assets)
    if (assetError) throw assetError
    const { error: publishError } = await admin.from('photobooth_albums').update({ status: 'published', updated_at: new Date().toISOString() }).eq('id', album.id)
    if (publishError) throw publishError
    await admin.from('photobooth_album_upload_events').insert({ client_hash: clientHash, album_id: album.id })
  } catch (error) {
    console.error('Album upload failed', error)
    if (uploadedPaths.length) await admin.storage.from(bucket).remove(uploadedPaths)
    await admin.from('photobooth_albums').delete().eq('id', album.id)
    return json({ error: 'Tải album thất bại. Hãy thử lại.' }, 500, origin)
  }

  return json({ shareCode: album.share_code, url: `${galleryBaseUrl}/i/${encodeURIComponent(album.share_code)}` }, 201, origin)
})
