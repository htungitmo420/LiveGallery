import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { isAllowedOrigin } from '../_shared/r2.ts'
import { handleJsonPublish, handleMultipartPublish } from './handlers.ts'
import {
  corsHeadersFor,
  getAllowedOrigins,
  jsonResponse,
  resolveGalleryBaseUrl,
  type PublishContext,
} from './http.ts'
import { normalizeMimeType } from './validation.ts'

Deno.serve(async (request: Request) => {
  const startedAt = performance.now()
  const origin = request.headers.get('origin')
  const allowedOrigins = getAllowedOrigins()

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFor(origin, allowedOrigins) })
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Phương thức không được hỗ trợ.' }, 405, origin, allowedOrigins)
  }
  if (!isAllowedOrigin(origin, allowedOrigins) || request.headers.get('x-photobooth-client') !== 'web-v1') {
    return jsonResponse({ error: 'Nguồn tải lên không được phép.' }, 403, origin, allowedOrigins)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Máy chủ album chưa được cấu hình.' }, 500, origin, allowedOrigins)
  }

  const ctx: PublishContext = {
    startedAt,
    origin,
    allowedOrigins,
    galleryBaseUrl: resolveGalleryBaseUrl(),
    dbConfig: { url: supabaseUrl, serviceRoleKey },
    serviceRoleKey,
  }

  const baseContentType = normalizeMimeType(request.headers.get('content-type') || '')
  if (baseContentType === 'application/json') {
    return handleJsonPublish(request, ctx)
  }
  if (baseContentType === 'multipart/form-data') {
    return handleMultipartPublish(request, ctx)
  }

  return jsonResponse({ error: 'Định dạng dữ liệu tải lên không được hỗ trợ.' }, 415, origin, allowedOrigins)
})
