const CIRCLE_POCKET_BROWSER_SESSION_KEY = 'hashpaylink-helper-browser-session-v1'

export function getCirclePocketBrowserSession() {
  if (typeof window === 'undefined') return ''
  const stored = window.localStorage.getItem(CIRCLE_POCKET_BROWSER_SESSION_KEY)?.trim().toLowerCase() ?? ''
  if (/^[a-f0-9]{64}$/.test(stored)) return stored
  const bytes = new Uint8Array(32)
  window.crypto.getRandomValues(bytes)
  const token = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  window.localStorage.setItem(CIRCLE_POCKET_BROWSER_SESSION_KEY, token)
  return token
}

type CirclePocketAgentHeadersOptions = {
  authenticated?: boolean
  getAccessToken?: () => Promise<string | null>
  json?: boolean
}

export async function circlePocketAgentHeaders({
  authenticated = false,
  getAccessToken,
  json = false,
}: CirclePocketAgentHeadersOptions = {}) {
  const headers: Record<string, string> = {
    'X-Helper-Session': getCirclePocketBrowserSession(),
  }
  if (json) headers['Content-Type'] = 'application/json'
  if (authenticated) {
    const accessToken = await getAccessToken?.()
    if (!accessToken) throw new Error('Your Circle Pocket session expired. Sign in again to continue.')
    headers.Authorization = `Bearer ${accessToken}`
  }
  return headers
}
