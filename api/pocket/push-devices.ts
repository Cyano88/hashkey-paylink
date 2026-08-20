import type { Request, Response } from 'express'
import { createSign } from 'node:crypto'
import { verifiedPrivyUser } from '../local-currency-profile.js'
import { mutateDurableJson, readDurableJson } from '../render-durable-store.js'

type PocketPushDevice = { ownerId: string; token: string; platform: 'android' | 'ios'; updatedAt: number }
type PocketPushStore = { devices: Record<string, PocketPushDevice>; delivered: Record<string, number> }
const STORE_KEY = 'hashpaylink:pocket-push:v1'
const normalized = (value?: Partial<PocketPushStore>): PocketPushStore => ({
  devices: value?.devices ?? {},
  delivered: value?.delivered ?? {},
})

function cleanToken(value: unknown) {
  const token = String(value ?? '').trim()
  if (token.length < 20 || token.length > 4_096) throw Object.assign(new Error('Push token is invalid.'), { status: 400 })
  return token
}

export async function registerPocketPushDevice(ownerId: string, tokenValue: unknown, platformValue: unknown) {
  const token = cleanToken(tokenValue)
  const platform = platformValue === 'ios' ? 'ios' : 'android'
  await mutateDurableJson<PocketPushStore>(STORE_KEY, current => {
    const store = normalized(current)
    store.devices[token] = { ownerId, token, platform, updatedAt: Date.now() }
    return store
  })
}

export function pocketPushConfigured() {
  return Boolean(String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '').trim())
}

export async function listPocketPushOwners() {
  const snapshot = normalized(await readDurableJson<PocketPushStore>(STORE_KEY))
  return [...new Set(Object.values(snapshot.devices).map(device => device.ownerId).filter(Boolean))]
}
export async function unregisterPocketPushDevice(ownerId: string, tokenValue: unknown) {
  const token = cleanToken(tokenValue)
  await mutateDurableJson<PocketPushStore>(STORE_KEY, current => {
    const store = normalized(current)
    if (store.devices[token]?.ownerId === ownerId) delete store.devices[token]
    return store
  })
}

export async function unregisterAllPocketPushDevices(ownerId: string) {
  await mutateDurableJson<PocketPushStore>(STORE_KEY, current => {
    const store = normalized(current)
    for (const [token, device] of Object.entries(store.devices)) {
      if (device.ownerId === ownerId) delete store.devices[token]
    }
    for (const deliveryKey of Object.keys(store.delivered)) {
      if (deliveryKey.startsWith(ownerId + ':')) delete store.delivered[deliveryKey]
    }
    return store
  })
}

type FirebaseServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string }
let firebaseTokenCache: { token: string; expiresAt: number } | null = null

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url')
}

function firebaseServiceAccount(): FirebaseServiceAccount | null {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '').trim()
  if (!raw) return null
  const serviceAccount = JSON.parse(raw) as Partial<FirebaseServiceAccount>
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) throw new Error('Firebase service account is incomplete.')
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
  return serviceAccount as FirebaseServiceAccount
}

async function firebaseAccessToken(serviceAccount: FirebaseServiceAccount) {
  if (firebaseTokenCache && firebaseTokenCache.expiresAt > Date.now() + 60_000) return firebaseTokenCache.token
  const now = Math.floor(Date.now() / 1_000)
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3_600,
  }))
  const unsigned = header + '.' + claims
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  const assertion = unsigned + '.' + base64Url(signer.sign(serviceAccount.private_key))
  const response = await fetch(serviceAccount.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  const data = await response.json() as { access_token?: string; expires_in?: number }
  if (!response.ok || !data.access_token) throw new Error('Firebase authorization failed.')
  firebaseTokenCache = { token: data.access_token, expiresAt: Date.now() + Math.max(300, data.expires_in || 3_600) * 1_000 }
  return data.access_token
}

export async function sendPocketPush(ownerId: string, eventId: string, input: { title: string; body: string; path: string; tag?: string }) {
  const serviceAccount = firebaseServiceAccount()
  if (!serviceAccount) return
  const snapshot = normalized(await readDurableJson<PocketPushStore>(STORE_KEY))
  const deliveryKey = ownerId + ':' + eventId
  if (snapshot.delivered[deliveryKey]) return
  const tokens = Object.values(snapshot.devices).filter(device => device.ownerId === ownerId).map(device => device.token).slice(0, 500)
  if (!tokens.length) return
  const accessToken = await firebaseAccessToken(serviceAccount)
  const responses = await Promise.all(tokens.map(async token => {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: {
        token,
        notification: { title: input.title, body: input.body },
        data: { path: input.path, eventId },
        android: { priority: 'high', notification: { channel_id: 'pocket-payments', visibility: 'PRIVATE', ...(input.tag ? { tag: input.tag } : {}) } },
        apns: { payload: { aps: { sound: 'default' } } },
      } }),
    })
    return { ok: response.ok, body: response.ok ? '' : await response.text() }
  }))
  await mutateDurableJson<PocketPushStore>(STORE_KEY, current => {
    const store = normalized(current)
    const cutoff = Date.now() - 45 * 24 * 60 * 60_000
    Object.entries(store.delivered).forEach(([key, deliveredAt]) => { if (deliveredAt < cutoff) delete store.delivered[key] })
    if (responses.some(result => result.ok)) store.delivered[deliveryKey] = Date.now()
    responses.forEach((result, index) => {
      if (!result.ok && /UNREGISTERED|registration-token-not-registered|invalid-registration-token/i.test(result.body)) delete store.devices[tokens[index]]
    })
    return store
  })
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST' && req.method !== 'DELETE') return res.status(405).json({ ok: false, error: { message: 'Method not allowed.' } })
  try {
    const identity = await verifiedPrivyUser(req)
    if (req.method === 'DELETE') await unregisterPocketPushDevice(identity.userId, req.body?.token)
    else await registerPocketPushDevice(identity.userId, req.body?.token, req.body?.platform)
    return res.json({ ok: true })
  } catch (reason) {
    const error = reason as Error & { status?: number }
    return res.status(error.status && error.status < 500 ? error.status : 503).json({ ok: false, error: { message: error.message || 'Push registration is unavailable.' } })
  }
}
