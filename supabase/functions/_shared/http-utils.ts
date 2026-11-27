export const DEFAULT_ALLOWED_PHOTOBOOTH_ORIGIN = 'https://photobooth-itmo.vercel.app'

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
