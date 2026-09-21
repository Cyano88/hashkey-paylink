import { createHmac, timingSafeEqual } from 'node:crypto'

export type SmileEnvironment = 'sandbox' | 'production'
export type SmileConfig = { partnerId: string; apiKey: string; environment: SmileEnvironment; callbackUrl: string }

export function smileConfig(): SmileConfig {
  const partnerId = (process.env.SMILE_PARTNER_ID || '').trim()
  const apiKey = (process.env.SMILE_API_KEY || '').trim()
  const environment = process.env.SMILE_ENVIRONMENT
  if (!partnerId || !apiKey || !['sandbox', 'production'].includes(environment || '')) {
    throw Object.assign(new Error('Identity verification is not configured yet.'), { status: 503 })
  }
  // Production requires a separate rollout after provider approval and sandbox acceptance.
  if (environment === 'production' && process.env.SMILE_PRODUCTION_ENABLED !== 'true') {
    throw Object.assign(new Error('Production identity verification is not enabled yet.'), { status: 503 })
  }
  return { partnerId, apiKey, environment: environment as SmileEnvironment, callbackUrl: 'https://hashkey-paylink.onrender.com/api/pocket/kyc/callback' }
}

// Wire format follows smileidentity/smile-identity-core-js src/signature.ts.
export function smileSignature(config: SmileConfig, timestamp: string) {
  return createHmac('sha256', config.apiKey).update(timestamp).update(config.partnerId).update('sid_request').digest('base64')
}
export function validSmileSignature(config: SmileConfig, body: Record<string, any>) {
  if (typeof body.timestamp !== 'string' || typeof body.signature !== 'string' || !Number.isFinite(Date.parse(body.timestamp))) return false
  const expected = Buffer.from(smileSignature(config, body.timestamp), 'base64')
  const actual = Buffer.from(body.signature, 'base64')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
export async function smileRequest(config: SmileConfig, endpoint: 'token' | 'job_status', params: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const host = config.environment === 'sandbox' ? 'https://testapi.smileidentity.com' : 'https://api.smileidentity.com'
  let response: Response
  try {
    response = await fetch(`${host}/v1/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, partner_id: config.partnerId, timestamp, signature: smileSignature(config, timestamp) }), signal: AbortSignal.timeout(15000) })
  } catch { throw Object.assign(new Error('Smile ID could not be reached. Please try again.'), { status: 503 }) }
  const data = await response.json().catch(() => null)
  // Smile ID uses 2304 for an unsubmitted/unknown job, without a response signature.
  // Accept this only from the authenticated server-to-server HTTPS status request.
  if (endpoint === 'job_status' && response.status === 400 && String(data?.code) === '2304') return { job_found: false, job_complete: false }
  if (!response.ok || !data || typeof data !== 'object') {
    // Do not expose provider responses containing identity information or credentials.
    throw Object.assign(new Error('Smile ID could not complete this request. Please try again.'), { status: 503 })
  }
  if (endpoint === 'job_status' && !validSmileSignature(config, data)) throw Object.assign(new Error('Verification result could not be authenticated.'), { status: 502 })
  return data as Record<string, any>
}
