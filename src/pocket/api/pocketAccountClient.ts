import { pocketApiUrl } from '../lib/pocketRoutes'

export async function deletePocketAccount(getAccessToken: () => Promise<string | null>, confirmation: string) {
  const accessToken = await getAccessToken()
  if (!accessToken) throw new Error('Sign in again to delete your account.')
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(pocketApiUrl('/api/pocket/account'), {
      method: 'DELETE',
      cache: 'no-store',
      signal: controller.signal,
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation }),
    })
    const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string }
    if (!response.ok || data.ok !== true) throw new Error(data.error || 'Pocket could not delete your account.')
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') {
      throw new Error('Account deletion took too long. Your account is still accessible; try again.')
    }
    throw reason
  } finally {
    window.clearTimeout(timeout)
  }
}
