import { track } from '@vercel/analytics'

type EventProperties = Record<string, string | number | boolean>

/** Keep analytics optional and never send source-code or bundle contents. */
export function trackEvent(name: string, properties?: EventProperties) {
  if (typeof window === 'undefined') return
  void track(name, properties)
}
