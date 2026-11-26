export interface SupabaseRestConfig {
  url: string
  serviceRoleKey: string
}

export interface SupabaseRestResult<T> {
  data: T | null
  error: { status: number; code?: string; message: string } | null
}

function encodeStoragePath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/')
}

function baseHeaders(config: SupabaseRestConfig, extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    Accept: 'application/json',
    ...(extra ?? {}),
  }
}

async function parseRestError(response: Response): Promise<{ status: number; code?: string; message: string }> {
  try {
    const body = (await response.json()) as { code?: unknown; message?: unknown; error?: unknown }
    return {
      status: response.status,
      code: typeof body.code === 'string' ? body.code : undefined,
      message: typeof body.message === 'string'
        ? body.message
        : typeof body.error === 'string'
          ? body.error
          : `HTTP ${response.status}`,
    }
  } catch {
    return { status: response.status, message: `HTTP ${response.status}` }
  }
}

export async function postgrestSelect<T>(
  config: SupabaseRestConfig,
  table: string,
  queryString: string,
): Promise<SupabaseRestResult<T>> {
  const base = config.url.replace(/\/+$/, '')
  const response = await fetch(`${base}/rest/v1/${table}?${queryString}`, {
    method: 'GET',
    headers: baseHeaders(config),
  })
  if (!response.ok) {
    return { data: null, error: await parseRestError(response) }
  }
  const data = (await response.json()) as T
  return { data, error: null }
}

export async function postgrestRpc<T>(
  config: SupabaseRestConfig,
  fnName: string,
  args: Record<string, unknown> = {},
): Promise<SupabaseRestResult<T>> {
  const base = config.url.replace(/\/+$/, '')
  const response = await fetch(`${base}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: baseHeaders(config, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(args),
  })
  if (!response.ok) {
    return { data: null, error: await parseRestError(response) }
  }
  const data = (await response.json()) as T
  return { data, error: null }
}

export async function postgrestDelete<T>(
  config: SupabaseRestConfig,
  table: string,
  queryString: string,
): Promise<SupabaseRestResult<T>> {
  const base = config.url.replace(/\/+$/, '')
  const response = await fetch(`${base}/rest/v1/${table}?${queryString}`, {
    method: 'DELETE',
    headers: baseHeaders(config, { Prefer: 'return=representation' }),
  })
  if (!response.ok) {
    return { data: null, error: await parseRestError(response) }
  }
  const data = (await response.json()) as T
  return { data, error: null }
}

export function buildStoragePublicUrl(config: SupabaseRestConfig, bucket: string, assetPath: string): string {
  const base = config.url.replace(/\/+$/, '')
  const cleanPath = assetPath.replace(/^\/+/, '')
  return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeStoragePath(cleanPath)}`
}

export async function createStorageSignedUrl(
  config: SupabaseRestConfig,
  bucket: string,
  objectPath: string,
  expiresInSeconds: number,
): Promise<SupabaseRestResult<string>> {
  const base = config.url.replace(/\/+$/, '')
  const cleanPath = objectPath.replace(/^\/+/, '')
  const response = await fetch(
    `${base}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodeStoragePath(cleanPath)}`,
    {
      method: 'POST',
      headers: baseHeaders(config, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    },
  )
  if (!response.ok) {
    return { data: null, error: await parseRestError(response) }
  }
  const body = (await response.json()) as { signedURL?: unknown; signedUrl?: unknown }
  const relative = typeof body.signedURL === 'string'
    ? body.signedURL
    : typeof body.signedUrl === 'string'
      ? body.signedUrl
      : ''
  if (!relative) {
    return { data: null, error: { status: 500, message: 'Missing signedURL in storage response' } }
  }
  const fullUrl = relative.startsWith('http://') || relative.startsWith('https://')
    ? relative
    : `${base}/storage/v1${relative.startsWith('/') ? '' : '/'}${relative}`
  return { data: fullUrl, error: null }
}

export async function uploadStorageObject(
  config: SupabaseRestConfig,
  bucket: string,
  objectKey: string,
  body: Blob | Uint8Array | ArrayBuffer,
  contentType: string,
  cacheControl = '3600',
): Promise<SupabaseRestResult<void>> {
  const base = config.url.replace(/\/+$/, '')
  const cleanKey = objectKey.replace(/^\/+/, '')
  let payload: BodyInit
  if (body instanceof Uint8Array) {
    if (body.byteOffset === 0 && body.byteLength === body.buffer.byteLength && body.buffer instanceof ArrayBuffer) {
      payload = body.buffer
    } else {
      const copy = new Uint8Array(body.byteLength)
      copy.set(body)
      payload = copy.buffer
    }
  } else {
    payload = body
  }
  const response = await fetch(
    `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(cleanKey)}`,
    {
      method: 'POST',
      headers: baseHeaders(config, {
        'Content-Type': contentType,
        'cache-control': `max-age=${cacheControl}`,
        'x-upsert': 'false',
      }),
      body: payload,
    },
  )
  if (!response.ok) {
    return { data: null, error: await parseRestError(response) }
  }
  return { data: undefined, error: null }
}

export async function removeStorageObjects(
  config: SupabaseRestConfig,
  bucket: string,
  prefixes: readonly string[],
): Promise<void> {
  if (prefixes.length === 0) return
  const base = config.url.replace(/\/+$/, '')
  await fetch(`${base}/storage/v1/object/${encodeURIComponent(bucket)}`, {
    method: 'DELETE',
    headers: baseHeaders(config, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes }),
  }).catch(() => undefined)
}
