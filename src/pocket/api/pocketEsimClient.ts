import { pocketApiUrl } from '../lib/pocketRoutes'
export async function pocketEsimRequest(getAccessToken: () => Promise<string | null>, body?: Record<string, unknown>) {
  const token = await getAccessToken()
  if (!token) throw Error('Sign in to view your eSIMs.')
  const response = await fetch(pocketApiUrl('/api/pocket/esim/orders'), { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) }).catch(() => { throw Error('Could not update your eSIM. Please try again.') })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(Error(data.error || 'Could not update your eSIM. Please try again.'), { code: data.code })
  return data
}
