export const R2_STORAGE_PREFIX = 'r2:'
export const EMPTY_SHA256_HEX = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
export const DEFAULT_ALLOWED_PHOTOBOOTH_ORIGIN = 'https://photobooth-itmo.vercel.app'
// Hard storage cap set to 9.5 GB (decimal, matching Cloudflare R2 10 GB free-tier billing)
// to leave a 500 MB safety buffer for in-flight uploads and lifecycle deletion lag.
export const DEFAULT_R2_MAX_STORAGE_BYTES = 9_500_000_000

const R2_REGION = 'auto'
const R2_SERVICE = 's3'
const MAX_KEY_LENGTH = 512
const MAX_PRESIGN_PUT_TTL_SECONDS = 3600
const MAX_PRESIGN_GET_TTL_SECONDS = 604800
const DEFAULT_UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000
const MAX_UPLOAD_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/i
const BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALBUM_FILENAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/i
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/
const UNSIGNED_INT_PATTERN = /^\d+$/

const encoder = new TextEncoder()

export function hasControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export type EnvGetter = (name: string) => string | undefined

export interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
}

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

export type UploadFileRole = 'strip' | 'gif' | 'photo'

export interface UploadManifestFile {
  index: number
  role: UploadFileRole
  name: string
  mimeType: string
  storagePath: string
}

function defaultEnvGetter(name: string): string | undefined {
  const denoGlobal = (globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }).Deno
  return denoGlobal?.env?.get?.(name)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer) {
    return bytes.buffer
  }
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function utf8(text: string): Uint8Array {
  return encoder.encode(text)
}

export function toHex(bytes: Uint8Array): string {
  let out = ''
  for (let index = 0; index < bytes.length; index += 1) {
    out += bytes[index].toString(16).padStart(2, '0')
  }
  return out
}

export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

export function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString()
  // YYYY-MM-DDTHH:mm:ss.sssZ -> YYYYMMDDTHHMMSSZ
  const dateStamp = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}`
  const timeStamp = `${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}`
  return {
    amzDate: `${dateStamp}T${timeStamp}Z`,
    dateStamp,
  }
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? utf8(data) : data
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes))
  return toHex(new Uint8Array(digest))
}

export async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, toArrayBuffer(utf8(message)))
  return new Uint8Array(signature)
}

export async function hmacSha256Hex(key: Uint8Array, message: string): Promise<string> {
  return toHex(await hmacSha256(key, message))
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || a.length !== b.length) {
    return false
  }
  let diff = 0
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return diff === 0
}

export function readR2Config(envGetter: EnvGetter = defaultEnvGetter): R2Config | null {
  const accountId = envGetter('R2_ACCOUNT_ID')?.trim() ?? ''
  const accessKeyId = envGetter('R2_ACCESS_KEY_ID')?.trim() ?? ''
  const secretAccessKey = envGetter('R2_SECRET_ACCESS_KEY')?.trim() ?? ''
  const bucketName = envGetter('R2_BUCKET_NAME')?.trim() ?? ''

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return null
  }
  if (!ACCOUNT_ID_PATTERN.test(accountId) || !BUCKET_NAME_PATTERN.test(bucketName)) {
    return null
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName }
}

export function isR2Configured(envGetter: EnvGetter = defaultEnvGetter): boolean {
  return readR2Config(envGetter) !== null
}

export function parseR2MaxStorageBytes(
  rawValue: string | undefined,
  fallbackBytes: number = DEFAULT_R2_MAX_STORAGE_BYTES,
): number {
  const trimmed = rawValue?.trim() ?? ''
  if (!trimmed) return fallbackBytes
  if (!UNSIGNED_INT_PATTERN.test(trimmed)) return fallbackBytes
  const parsed = Number(trimmed)
  if (!Number.isSafeInteger(parsed) || parsed < 0) return fallbackBytes
  return parsed
}

export function hasR2StorageCapacity(
  usedBytes: number,
  incomingBytes: number,
  maxBytes: number = DEFAULT_R2_MAX_STORAGE_BYTES,
): boolean {
  if (
    !Number.isFinite(usedBytes)
    || !Number.isFinite(incomingBytes)
    || !Number.isFinite(maxBytes)
    || usedBytes < 0
    || incomingBytes < 0
    || maxBytes <= 0
  ) {
    return false
  }
  return usedBytes + incomingBytes <= maxBytes
}

function resolveR2Config(override?: R2Config): R2Config {
  const config = override ?? readR2Config()
  if (!config) {
    throw new Error('R2 storage is not configured.')
  }
  if (!ACCOUNT_ID_PATTERN.test(config.accountId) || !BUCKET_NAME_PATTERN.test(config.bucketName)) {
    throw new Error('R2 configuration is invalid.')
  }
  if (!config.accessKeyId || !config.secretAccessKey) {
    throw new Error('R2 credentials are missing.')
  }
  return config
}

export function isR2StoragePath(path: string): boolean {
  return typeof path === 'string' && path.startsWith(R2_STORAGE_PREFIX)
}

export function stripR2Prefix(path: string): string {
  return isR2StoragePath(path) ? path.slice(R2_STORAGE_PREFIX.length) : path
}

export function isSafeR2Key(key: string): boolean {
  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LENGTH) {
    return false
  }
  if (key.startsWith('/') || key.endsWith('/')) {
    return false
  }
  if (key.includes('\\') || key.includes('?') || key.includes('#') || hasControlChars(key)) {
    return false
  }
  const segments = key.split('/')
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..') {
      return false
    }
  }
  return true
}

export function isSafeAlbumR2Path(storagePath: string, albumId: string): boolean {
  if (!isR2StoragePath(storagePath) || !UUID_PATTERN.test(albumId)) {
    return false
  }
  const key = stripR2Prefix(storagePath)
  if (!isSafeR2Key(key)) {
    return false
  }
  const prefix = `${albumId.toLowerCase()}/`
  const lowerKey = key.toLowerCase()
  if (!lowerKey.startsWith(prefix)) {
    return false
  }
  const filePart = key.slice(prefix.length)
  return ALBUM_FILENAME_PATTERN.test(filePart)
}

export function encodeS3Key(key: string): string {
  if (!isSafeR2Key(key)) {
    throw new Error('Invalid R2 object key.')
  }
  return key.split('/').map(encodeRfc3986).join('/')
}

function normalizeHeaderValue(value: string): string {
  const trimmed = value.trim().replace(/[ \t]+/g, ' ')
  if (hasControlChars(trimmed)) {
    throw new Error('Invalid header value.')
  }
  return trimmed
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

function normalizeMimeHeader(contentType: string): string {
  const base = contentType.split(';', 1)[0].trim().toLowerCase()
  if (!base || hasControlChars(base) || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(base)) {
    throw new Error('Invalid content type.')
  }
  return base
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

export async function computeUploadManifestHash(files: readonly UploadManifestFile[]): Promise<string> {
  const canonical = files
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((file) => `${file.index}|${file.role}|${file.name}|${file.mimeType}|${file.storagePath}`)
    .join('\n')
  return sha256Hex(canonical)
}

async function deriveUploadTokenKey(secret: string): Promise<Uint8Array> {
  return hmacSha256(utf8(secret), 'khoanhkhac:upload-token:v1')
}

export async function createUploadToken(params: {
  albumId: string
  shareCode: string
  files: readonly UploadManifestFile[]
  secret: string
  nowMs?: number
  ttlMs?: number
}): Promise<{ token: string; expiresAtMs: number; manifestHash: string }> {
  const nowMs = params.nowMs ?? Date.now()
  const ttlMs = params.ttlMs ?? DEFAULT_UPLOAD_TOKEN_TTL_MS
  const expiresAtMs = nowMs + ttlMs
  const manifestHash = await computeUploadManifestHash(params.files)
  const tokenKey = await deriveUploadTokenKey(params.secret)
  const signature = await hmacSha256Hex(
    tokenKey,
    `${params.albumId}|${params.shareCode}|${expiresAtMs}|${manifestHash}`,
  )
  return {
    token: `v1.${expiresAtMs}.${manifestHash}.${signature}`,
    expiresAtMs,
    manifestHash,
  }
}

function parseUploadToken(token: string): {
  expiresAtMs: number
  manifestHash: string
  signature: string
} | null {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 4 || parts[0] !== 'v1') return null
  const [, expPart, manifestHash, signature] = parts
  if (!UNSIGNED_INT_PATTERN.test(expPart)) return null
  if (!SHA256_HEX_PATTERN.test(manifestHash) || !SHA256_HEX_PATTERN.test(signature)) return null
  const expiresAtMs = Number(expPart)
  if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= 0) return null
  return { expiresAtMs, manifestHash, signature }
}

export async function verifyUploadToken(params: {
  token: string
  albumId: string
  shareCode: string
  files: readonly UploadManifestFile[]
  secret: string
  nowMs?: number
}): Promise<boolean> {
  const parsed = parseUploadToken(params.token)
  if (!parsed) return false

  const nowMs = params.nowMs ?? Date.now()
  if (parsed.expiresAtMs <= nowMs || parsed.expiresAtMs > nowMs + MAX_UPLOAD_TOKEN_TTL_MS) {
    return false
  }

  const actualManifestHash = await computeUploadManifestHash(params.files)
  const tokenKey = await deriveUploadTokenKey(params.secret)
  const expectedSignature = await hmacSha256Hex(
    tokenKey,
    `${params.albumId}|${params.shareCode}|${parsed.expiresAtMs}|${actualManifestHash}`,
  )

  const manifestMatch = timingSafeEqual(parsed.manifestHash, actualManifestHash)
  const signatureMatch = timingSafeEqual(parsed.signature, expectedSignature)
  return manifestMatch && signatureMatch
}

export async function verifyUploadTokenForAbort(params: {
  token: string
  albumId: string
  shareCode: string
  secret: string
  nowMs?: number
}): Promise<boolean> {
  const parsed = parseUploadToken(params.token)
  if (!parsed) return false

  const nowMs = params.nowMs ?? Date.now()
  if (parsed.expiresAtMs <= nowMs || parsed.expiresAtMs > nowMs + MAX_UPLOAD_TOKEN_TTL_MS) {
    return false
  }

  const tokenKey = await deriveUploadTokenKey(params.secret)
  const expectedSignature = await hmacSha256Hex(
    tokenKey,
    `${params.albumId}|${params.shareCode}|${parsed.expiresAtMs}|${parsed.manifestHash}`,
  )
  return timingSafeEqual(parsed.signature, expectedSignature)
}

export function parseAllowedOrigins(
  rawValue: string | undefined,
  fallbackOrigin: string = DEFAULT_ALLOWED_PHOTOBOOTH_ORIGIN,
): string[] {
  const origins: string[] = []
  const seen = new Set<string>()
  const entries = (rawValue ?? '').split(',')

  for (const entry of entries) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    try {
      const parsed = new URL(trimmed)
      const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
      if (parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) {
        continue
      }
      if (!seen.has(parsed.origin)) {
        seen.add(parsed.origin)
        origins.push(parsed.origin)
      }
    } catch {
      /* Ignore malformed origin entries. */
    }
  }

  if (origins.length === 0) {
    origins.push(fallbackOrigin)
  }
  return origins
}

export function isAllowedOrigin(
  origin: string | null,
  allowedOrigins: readonly string[],
): boolean {
  if (!origin) return false
  try {
    const parsed = new URL(origin)
    if (parsed.origin !== origin) return false
    if (allowedOrigins.includes(parsed.origin)) return true
    const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
    return isLocalHost && (parsed.protocol === 'http:' || parsed.protocol === 'https:')
  } catch {
    return false
  }
}

export async function runWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const limit = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length))
  const results = new Array<R>(items.length)
  let nextIndex = 0
  let firstError: unknown = null
  let hasError = false

  async function runWorker(): Promise<void> {
    while (!hasError) {
      const currentIndex = nextIndex
      if (currentIndex >= items.length) return
      nextIndex += 1
      try {
        results[currentIndex] = await worker(items[currentIndex], currentIndex)
      } catch (error) {
        if (!hasError) {
          hasError = true
          firstError = error
        }
        return
      }
    }
  }

  const workers = Array.from({ length: limit }, () => runWorker())
  await Promise.allSettled(workers)

  if (hasError) {
    throw firstError
  }
  return results
}
