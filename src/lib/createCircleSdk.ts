import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'

// Circle treats any key=value fragment as an OAuth callback. Gift capabilities
// belong to Pocket: hide only that fragment while the synchronous SDK constructor
// inspects the URL, then restore it without navigating or changing router state.
export function createCircleSdk(...args: ConstructorParameters<typeof W3SSdk>): W3SSdk {
  if (typeof window === 'undefined' || !/^\/gift\/g_[A-Za-z0-9_-]{22}$/.test(window.location.pathname) || !/^#claim=[A-Za-z0-9_-]{43}$/.test(window.location.hash)) {
    return new W3SSdk(...args)
  }
  const original = window.location.href
  const clean = original.slice(0, original.indexOf('#'))
  const state = window.history.state
  window.history.replaceState(state, '', clean)
  try { return new W3SSdk(...args) }
  finally {
    if (window.location.href === clean) window.history.replaceState(state, '', original)
  }
}
