import { hmacSha256, hmacSha256Hex, sha256Hex, timingSafeEqual, utf8 } from './crypto.ts'
import { UNSIGNED_INT_PATTERN } from './r2-config.ts'

const DEFAULT_UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000
const MAX_UPLOAD_TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/

export type UploadFileRole = 'strip' | 'gif' | 'photo'

export interface UploadManifestFile {
  index: number
  role: UploadFileRole
  name: string
  mimeType: string
  storagePath: string
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
