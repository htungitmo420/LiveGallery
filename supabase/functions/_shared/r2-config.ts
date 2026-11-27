import { encodeRfc3986, hasControlChars } from './crypto.ts'

export const R2_STORAGE_PREFIX = 'r2:'
// Hard storage cap set to 9.5 GB (decimal, matching Cloudflare R2 10 GB free-tier billing)
// to leave a 500 MB safety buffer for in-flight uploads and lifecycle deletion lag.
export const DEFAULT_R2_MAX_STORAGE_BYTES = 9_500_000_000

const MAX_KEY_LENGTH = 512
const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/i
const BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALBUM_FILENAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/i
export const UNSIGNED_INT_PATTERN = /^\d+$/

export type EnvGetter = (name: string) => string | undefined

export interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
}

function defaultEnvGetter(name: string): string | undefined {
  const denoGlobal = (globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }).Deno
  return denoGlobal?.env?.get?.(name)
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

export function resolveR2Config(override?: R2Config): R2Config {
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
