const STORAGE_KEY = 'pocket:push-enabled'
const TOKEN_KEY = 'pocket:push-token'
export const POCKET_PUSH_PREFERENCE_EVENT = 'pocket:push-preference'

export function pocketPushEnabled() {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(STORAGE_KEY) !== 'false'
}

export function setPocketPushEnabled(enabled: boolean) {
  window.localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false')
  window.dispatchEvent(new CustomEvent(POCKET_PUSH_PREFERENCE_EVENT, { detail: { enabled } }))
}

export function readPocketPushToken() {
  return typeof window === 'undefined' ? '' : window.localStorage.getItem(TOKEN_KEY) || ''
}

export function rememberPocketPushToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token)
}

export function forgetPocketPushToken() {
  window.localStorage.removeItem(TOKEN_KEY)
}

export async function unregisterPocketPushDevice(getAccessToken: () => Promise<string | null>) {
  const token = readPocketPushToken()
  if (!token) return true
  const accessToken = await getAccessToken()
  if (!accessToken) return false
  const response = await fetch(POCKET_API.pushDevices, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  }).catch(() => null)
  if (!response?.ok) return false
  forgetPocketPushToken()
  return true
}
import { POCKET_API } from './pocketSchemas'
