import { pocketApiUrl } from '../lib/pocketRoutes'

type AccessTokenReader = () => Promise<string | null>

async function request(getAccessToken: AccessTokenReader, init?: RequestInit) {
  const accessToken = await getAccessToken()
  if (!accessToken) throw new Error('Sign in again to continue.')
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8_000)
  let response: Response
  try {
    response = await fetch(pocketApiUrl('/api/pocket/payment-security?v=1'), {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') throw new Error('Payment security took too long to respond.')
    throw reason
  } finally {
    window.clearTimeout(timeout)
  }
  const data = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok || data.ok !== true) throw Object.assign(new Error(String(data.error || 'Payment security did not respond.')), { status: response.status, lockedUntil: Number(data.lockedUntil || 0) })
  return data
}

export async function readPocketPaymentSecurity(getAccessToken: AccessTokenReader) {
  const data = await request(getAccessToken)
  return { configured: data.configured === true, lockedUntil: Number(data.lockedUntil || 0) }
}

export async function updatePocketPaymentSecurity(getAccessToken: AccessTokenReader, body: Record<string, unknown>) {
  return request(getAccessToken, { method: 'POST', body: JSON.stringify(body) })
}

export async function beginPocketPaymentPinReset(getAccessToken: AccessTokenReader) {
  const data = await updatePocketPaymentSecurity(getAccessToken, { action: 'begin-reset' })
  const resetToken = String(data.resetToken || '')
  if (!resetToken) throw new Error('Pocket PIN reset could not start.')
  return { resetToken, expiresAt: Number(data.expiresAt || 0) }
}

export async function verifyPocketPaymentPin(getAccessToken: AccessTokenReader, pin: string) {
  const accessToken = await getAccessToken()
  if (!accessToken) throw new Error('Sign in again to continue.')
  const data = await updatePocketPaymentSecurity(async () => accessToken, { action: 'verify', pin })
  const approvalToken = String(data.approvalToken || '')
  if (!approvalToken) throw new Error('Payment approval did not complete.')
  return { approvalToken, expiresAt: Number(data.expiresAt || 0), authorization: `Bearer ${accessToken}` }
}
