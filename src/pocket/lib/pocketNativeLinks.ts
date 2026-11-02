import { pocketScanDestination } from './pocketScanCode'

export function nativePocketDestination(raw: string) {
  const scan = pocketScanDestination(raw)
  if (scan) return scan
  try {
    const url = new URL(raw)
    if (url.username || url.password || url.port) return ''
    if (url.protocol !== 'pocket:' && (url.protocol !== 'https:' || url.hostname !== 'pocket.hashpaylink.com')) return ''
    return `${url.pathname || '/'}${url.search}${url.hash}`
  } catch { return '' }
}

// A live intent wins over the asynchronous initial intent. Capacitor can also
// deliver the same intent through both APIs during startup.
export function createPocketNativeLinkRouter(navigate: (path: string, options: {replace: boolean}) => void, now = Date.now) {
  let active = true, eventSeen = false, lastPath = '', lastAt = -Infinity
  const deliver = (raw: string, replace: boolean) => {
    if (!active) return
    const path = nativePocketDestination(raw), at = now()
    if (!path || (path === lastPath && at - lastAt < 1500)) return
    lastPath = path
    lastAt = at
    navigate(path, {replace})
  }
  return {
    event(raw: string) { if (nativePocketDestination(raw)) { eventSeen = true; deliver(raw, false) } },
    launch(raw: string) { if (!eventSeen) deliver(raw, true) },
    dispose() { active = false },
  }
}
