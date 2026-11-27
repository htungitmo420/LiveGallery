import {
  EMPTY_SHA256_HEX,
  encodeRfc3986,
  formatAmzDate,
  hasControlChars,
  hmacSha256,
  hmacSha256Hex,
  sha256Hex,
  toArrayBuffer,
  utf8,
} from './crypto.ts'
import {
  UNSIGNED_INT_PATTERN,
  encodeS3Key,
  resolveR2Config,
  type R2Config,
} from './r2-config.ts'

const R2_REGION = 'auto'
const R2_SERVICE = 's3'
const MAX_PRESIGN_PUT_TTL_SECONDS = 3600
const MAX_PRESIGN_GET_TTL_SECONDS = 604800

export interface SigV4PresignInput {
  method: 'GET' | 'PUT'
  host: string
  canonicalUri: string
  region: string
  service: string
  accessKeyId: string
  secretAccessKey: string
  expiresInSeconds: number
  signedHeaders: Record<string, string>
  queryParams?: Record<string, string>
  now?: Date
}

export interface SigV4PresignResult {
  url: string
  canonicalRequest: string
  stringToSign: string
  signature: string
  amzDate: string
  credentialScope: string
}

export interface PresignPutOptions {
  key: string
  contentType: string
  contentLength?: number
  expiresInSeconds?: number
  now?: Date
  config?: R2Config
}

export interface PresignGetOptions {
  key: string
  expiresInSeconds?: number
  responseCacheControl?: string
  now?: Date
  config?: R2Config
}

export interface PutR2ObjectOptions {
  key: string
  body: Uint8Array | ArrayBuffer | Blob
  contentType: string
  cacheControl?: string
  now?: Date
  config?: R2Config
}

export interface HeadR2ObjectResult {
  exists: boolean
  contentLength: number | null
  contentType: string | null
  etag: string | null
}

function normalizeHeaderValue(value: string): string {
  const trimmed = value.trim().replace(/[ \t]+/g, ' ')
  if (hasControlChars(trimmed)) {
    throw new Error('Invalid header value.')
  }
  return trimmed
}

function normalizeMimeHeader(contentType: string): string {
  const base = contentType.split(';', 1)[0].trim().toLowerCase()
  if (!base || hasControlChars(base) || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(base)) {
    throw new Error('Invalid content type.')
  }
  return base
}

function buildCanonicalHeaders(headers: Record<string, string>): {
  canonicalHeaders: string
  signedHeaders: string
} {
  const entries = Object.entries(headers)
    .map(([name, value]) => [name.trim().toLowerCase(), normalizeHeaderValue(value)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

  const canonicalHeaders = entries.map(([name, value]) => `${name}:${value}\n`).join('')
  const signedHeaders = entries.map(([name]) => name).join(';')
  return { canonicalHeaders, signedHeaders }
}

const signingKeyCache = new Map<string, Uint8Array>()
const MAX_SIGNING_KEY_CACHE_SIZE = 8

export async function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<Uint8Array> {
  const cacheKey = `${dateStamp}|${region}|${service}|${secretAccessKey}`
  const cached = signingKeyCache.get(cacheKey)
  if (cached) return cached

  const kDate = await hmacSha256(utf8(`AWS4${secretAccessKey}`), dateStamp)
  const kRegion = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, service)
  const derived = await hmacSha256(kService, 'aws4_request')

  if (signingKeyCache.size >= MAX_SIGNING_KEY_CACHE_SIZE) {
    const oldest = signingKeyCache.keys().next().value
    if (oldest !== undefined) signingKeyCache.delete(oldest)
  }
  signingKeyCache.set(cacheKey, derived)
  return derived
}

export async function buildSigV4PresignedUrl(input: SigV4PresignInput): Promise<SigV4PresignResult> {
  const now = input.now ?? new Date()
  const { amzDate, dateStamp } = formatAmzDate(now)
  const credentialScope = `${dateStamp}/${input.region}/${input.service}/aws4_request`
  const { canonicalHeaders, signedHeaders } = buildCanonicalHeaders({
    ...input.signedHeaders,
    host: input.host,
  })

  const queryParams: Array<[string, string]> = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${input.accessKeyId}/${credentialScope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(input.expiresInSeconds)],
    ['X-Amz-SignedHeaders', signedHeaders],
    ...Object.entries(input.queryParams ?? {}),
  ]

  const canonicalQueryString = queryParams
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .sort()
    .join('&')

  const canonicalRequest = [
    input.method,
    input.canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const canonicalHash = await sha256Hex(canonicalRequest)
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    canonicalHash,
  ].join('\n')

  const signingKey = await deriveSigningKey(
    input.secretAccessKey,
    dateStamp,
    input.region,
    input.service,
  )
  const signature = await hmacSha256Hex(signingKey, stringToSign)
  const url = `https://${input.host}${input.canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`

  return {
    url,
    canonicalRequest,
    stringToSign,
    signature,
    amzDate,
    credentialScope,
  }
}

async function buildSignedRequestHeaders(params: {
  method: 'PUT' | 'HEAD' | 'DELETE'
  key: string
  payloadHash: string
  extraHeaders?: Record<string, string>
  now?: Date
  config?: R2Config
}): Promise<{ url: string; headers: Record<string, string> }> {
  const config = resolveR2Config(params.config)
  const encodedKey = encodeS3Key(params.key)
  const host = `${config.accountId}.r2.cloudflarestorage.com`
  const canonicalUri = `/${encodeRfc3986(config.bucketName)}/${encodedKey}`
  const { amzDate, dateStamp } = formatAmzDate(params.now ?? new Date())
  const credentialScope = `${dateStamp}/${R2_REGION}/${R2_SERVICE}/aws4_request`

  const headersToSign: Record<string, string> = {
    host,
    'x-amz-content-sha256': params.payloadHash,
    'x-amz-date': amzDate,
    ...(params.extraHeaders ?? {}),
  }

  const { canonicalHeaders, signedHeaders } = buildCanonicalHeaders(headersToSign)
  const canonicalRequest = [
    params.method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    params.payloadHash,
  ].join('\n')

  const canonicalHash = await sha256Hex(canonicalRequest)
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    canonicalHash,
  ].join('\n')

  const signingKey = await deriveSigningKey(
    config.secretAccessKey,
    dateStamp,
    R2_REGION,
    R2_SERVICE,
  )
  const signature = await hmacSha256Hex(signingKey, stringToSign)
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, `
    + `SignedHeaders=${signedHeaders}, Signature=${signature}`

  const outgoingHeaders: Record<string, string> = {
    'x-amz-content-sha256': params.payloadHash,
    'x-amz-date': amzDate,
    Authorization: authorization,
    ...(params.extraHeaders ?? {}),
  }

  return {
    url: `https://${host}${canonicalUri}`,
    headers: outgoingHeaders,
  }
}

export async function createR2PresignedPutUrl(options: PresignPutOptions): Promise<string> {
  const config = resolveR2Config(options.config)
  const expiresInSeconds = options.expiresInSeconds ?? 300
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > MAX_PRESIGN_PUT_TTL_SECONDS) {
    throw new Error('Invalid presigned PUT expiry.')
  }
  if (
    options.contentLength !== undefined
    && (!Number.isInteger(options.contentLength) || options.contentLength <= 0)
  ) {
    throw new Error('Invalid content length.')
  }

  const normalizedContentType = normalizeMimeHeader(options.contentType)
  const encodedKey = encodeS3Key(options.key)
  const host = `${config.accountId}.r2.cloudflarestorage.com`
  const canonicalUri = `/${encodeRfc3986(config.bucketName)}/${encodedKey}`

  // Sign only content-type and host so browser fetch(putUrl, { method: 'PUT', headers: { 'Content-Type': ... }, body })
  // never fails due to browser-managed Content-Length. Exact size is verified via headR2Object during complete.
  const signed = await buildSigV4PresignedUrl({
    method: 'PUT',
    host,
    canonicalUri,
    region: R2_REGION,
    service: R2_SERVICE,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    expiresInSeconds,
    signedHeaders: {
      'content-type': normalizedContentType,
    },
    now: options.now,
  })

  return signed.url
}

export async function createR2PresignedGetUrl(options: PresignGetOptions): Promise<string> {
  const config = resolveR2Config(options.config)
  const expiresInSeconds = options.expiresInSeconds ?? 3600
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > MAX_PRESIGN_GET_TTL_SECONDS) {
    throw new Error('Invalid presigned GET expiry.')
  }

  const encodedKey = encodeS3Key(options.key)
  const host = `${config.accountId}.r2.cloudflarestorage.com`
  const canonicalUri = `/${encodeRfc3986(config.bucketName)}/${encodedKey}`

  const queryParams = options.responseCacheControl
    ? { 'response-cache-control': normalizeHeaderValue(options.responseCacheControl) }
    : undefined

  const signed = await buildSigV4PresignedUrl({
    method: 'GET',
    host,
    canonicalUri,
    region: R2_REGION,
    service: R2_SERVICE,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    expiresInSeconds,
    signedHeaders: {},
    queryParams,
    now: options.now,
  })

  return signed.url
}

async function toBytes(body: Uint8Array | ArrayBuffer | Blob): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  return new Uint8Array(await body.arrayBuffer())
}

export async function putR2Object(options: PutR2ObjectOptions): Promise<{ etag: string | null }> {
  const bytes = await toBytes(options.body)
  const normalizedContentType = normalizeMimeHeader(options.contentType)
  const payloadHash = await sha256Hex(bytes)
  const extraHeaders: Record<string, string> = {
    'content-type': normalizedContentType,
    ...(options.cacheControl ? { 'cache-control': normalizeHeaderValue(options.cacheControl) } : {}),
  }

  const { url, headers } = await buildSignedRequestHeaders({
    method: 'PUT',
    key: options.key,
    payloadHash,
    extraHeaders,
    now: options.now,
    config: options.config,
  })

  const response = await fetch(url, {
    method: 'PUT',
    headers,
    body: toArrayBuffer(bytes),
  })
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error(`R2 PUT failed with status ${response.status}.`)
  }
  await response.body?.cancel().catch(() => undefined)
  return { etag: response.headers.get('etag') }
}

export async function headR2Object(
  key: string,
  options?: { now?: Date; config?: R2Config },
): Promise<HeadR2ObjectResult> {
  const { url, headers } = await buildSignedRequestHeaders({
    method: 'HEAD',
    key,
    payloadHash: EMPTY_SHA256_HEX,
    now: options?.now,
    config: options?.config,
  })

  const response = await fetch(url, {
    method: 'HEAD',
    headers,
  })
  await response.body?.cancel().catch(() => undefined)

  if (response.status === 404) {
    return { exists: false, contentLength: null, contentType: null, etag: null }
  }
  if (!response.ok) {
    throw new Error(`R2 HEAD failed with status ${response.status}.`)
  }

  const rawLength = response.headers.get('content-length')?.trim() ?? ''
  const parsedLength = UNSIGNED_INT_PATTERN.test(rawLength) ? Number(rawLength) : null
  const contentLength = parsedLength !== null && Number.isSafeInteger(parsedLength) ? parsedLength : null
  const rawType = response.headers.get('content-type')
  const contentType = rawType ? rawType.split(';', 1)[0].trim().toLowerCase() : null

  return {
    exists: true,
    contentLength,
    contentType,
    etag: response.headers.get('etag'),
  }
}

export async function deleteR2Object(
  key: string,
  options?: { now?: Date; config?: R2Config },
): Promise<void> {
  const { url, headers } = await buildSignedRequestHeaders({
    method: 'DELETE',
    key,
    payloadHash: EMPTY_SHA256_HEX,
    now: options?.now,
    config: options?.config,
  })

  const response = await fetch(url, {
    method: 'DELETE',
    headers,
  })
  await response.body?.cancel().catch(() => undefined)

  if (response.status === 200 || response.status === 204 || response.status === 404) {
    return
  }
  throw new Error(`R2 DELETE failed with status ${response.status}.`)
}
