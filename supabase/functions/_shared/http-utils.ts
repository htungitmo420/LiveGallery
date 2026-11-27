export const DEFAULT_ALLOWED_PHOTOBOOTH_ORIGIN = 'https://photobooth-itmo.vercel.app'

const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/
const IPV6_PATTERN = /^[0-9a-f:]{2,45}$/i

export interface OriginCheckOptions {
  allowLocalhost?: boolean
}

export function isLocalhostEnabled(rawValue: string | undefined): boolean {
  return rawValue?.trim().toLowerCase() === 'true'
}

function normalizeIpCandidate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim().replace(/^\[|\]$/g, '')
  if (!trimmed || trimmed.length > 64) return null
  if (IPV4_PATTERN.test(trimmed)) {
    const octets = trimmed.split('.').map(Number)
    return octets.every((n) => n >= 0 && n <= 255) ? trimmed : null
  }
  if (trimmed.includes(':') && IPV6_PATTERN.test(trimmed)) {
    return trimmed.toLowerCase()
  }
  return null
}

/**
 * Extracts the client IP from proxy headers without trusting spoofable leftmost
 * X-Forwarded-For entries. On Supabase Edge Functions (Cloudflare -> Kong -> Deno),
 * cf-connecting-ip is overwritten by Cloudflare; when falling back to X-Forwarded-For,
 * take the rightmost valid proxy-appended IP rather than the client-controlled leftmost value.
 */
export function extractClientIp(headers: Headers): string {
  const cfRay = headers.get('cf-ray')?.trim()
  if (cfRay) {
    const cfIp = normalizeIpCandidate(headers.get('cf-connecting-ip'))
    if (cfIp) return cfIp
  }

  const realIp = normalizeIpCandidate(headers.get('x-real-ip'))
  if (realIp) return realIp

  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded.split(',')
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const candidate = normalizeIpCandidate(parts[index])
      if (candidate) return candidate
    }
  }

  return 'unknown'
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
  options?: OriginCheckOptions,
): boolean {
  if (!origin) return false
  try {
    const parsed = new URL(origin)
    if (parsed.origin !== origin) return false
    if (allowedOrigins.includes(parsed.origin)) return true
    if (options?.allowLocalhost) {
      const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
      return isLocalHost && (parsed.protocol === 'http:' || parsed.protocol === 'https:')
    }
    return false
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
