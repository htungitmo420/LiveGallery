import type { BeforeSendEvent } from '@vercel/analytics'

const ALBUM_PATH_PATTERN = /^\/i\/[^/]+\/?$/i

/**
 * Redacts private album share codes (/i/<shareCode>) before sending pageviews
 * to Vercel Analytics so guest album URLs never leak into analytics dashboards.
 */
export function redactAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent {
  try {
    const parsed = new URL(event.url)
    if (ALBUM_PATH_PATTERN.test(parsed.pathname)) {
      parsed.pathname = '/i/[album]'
      parsed.search = ''
      parsed.hash = ''
      return { ...event, url: parsed.toString() }
    }
    return event
  } catch {
    return event
  }
}
