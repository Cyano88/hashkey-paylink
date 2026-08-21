import type { Request, Response } from 'express'
import { createSign } from 'node:crypto'
import { connect } from 'node:http2'
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
  return Boolean(
    String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '').trim()
    || (
      String(process.env.APPLE_APNS_KEY_ID ?? '').trim()
      && String(process.env.APPLE_TEAM_ID ?? '').trim()
      && String(process.env.APPLE_APNS_PRIVATE_KEY ?? '').trim()
    )
  )
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

type ApplePushCredentials = { keyId: string; teamId: string; privateKey: string; topic: string }
let appleTokenCache: { token: string; expiresAt: number } | null = null

function applePushCredentials(): ApplePushCredentials | null {
  const keyId = String(process.env.APPLE_APNS_KEY_ID ?? '').trim()
  const teamId = String(process.env.APPLE_TEAM_ID ?? '').trim()
  const privateKey = String(process.env.APPLE_APNS_PRIVATE_KEY ?? '').trim().replace(/\\n/g, '\n')
  if (!keyId && !teamId && !privateKey) return null
  if (!/^[A-Z0-9]{10}$/.test(keyId) || !/^[A-Z0-9]{10}$/.test(teamId) || !privateKey.includes('PRIVATE KEY')) {
    throw new Error('Apple push credentials are incomplete.')
  }
  return {
    keyId,
    teamId,
    privateKey,
    topic: String(process.env.APPLE_APNS_TOPIC ?? 'com.hashpaylink.pocket').trim(),
  }
}

function appleAuthorizationToken(credentials: ApplePushCredentials) {
  if (appleTokenCache && appleTokenCache.expiresAt > Date.now() + 60_000) return appleTokenCache.token
  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: credentials.keyId }))
  const claims = base64Url(JSON.stringify({ iss: credentials.teamId, iat: Math.floor(Date.now() / 1_000) }))
  const unsigned = header + '.' + claims
  const signer = createSign('SHA256')
  signer.update(unsigned)
  const signature = signer.sign({ key: credentials.privateKey, dsaEncoding: 'ieee-p1363' })
  const token = unsigned + '.' + base64Url(signature)
  appleTokenCache = { token, expiresAt: Date.now() + 50 * 60_000 }
  return token
}

async function sendApplePush(
  origin: 'https://api.push.apple.com' | 'https://api.sandbox.push.apple.com',
  credentials: ApplePushCredentials,
  deviceToken: string,
  eventId: string,
  input: { title: string; body: string; path: string },
) {
  return new Promise<{ ok: boolean; status: number; body: string }>((resolve) => {
    const client = connect(origin)
    let settled = false
    const finish = (result: { ok: boolean; status: number; body: string }) => {
      if (settled) return
      settled = true
      client.close()
      resolve(result)
    }
    client.once('error', error => finish({ ok: false, status: 0, body: error.message }))
    client.setTimeout(10_000, () => finish({ ok: false, status: 0, body: 'Apple push request timed out.' }))
    const request = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${appleAuthorizationToken(credentials)}`,
      'apns-topic': credentials.topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    })
    let status = 0
    let body = ''
    request.setEncoding('utf8')
    request.on('response', headers => { status = Number(headers[':status'] ?? 0) })
    request.on('data', chunk => { body += String(chunk) })
    request.on('end', () => finish({ ok: status === 200, status, body }))
    request.on('error', error => finish({ ok: false, status, body: error.message }))
    request.end(JSON.stringify({
      aps: { alert: { title: input.title, body: input.body }, sound: 'default' },
      path: input.path,
      eventId,
    }))
  })
}

async function sendApplePushWithEnvironmentFallback(
  credentials: ApplePushCredentials,
  deviceToken: string,
  eventId: string,
  input: { title: string; body: string; path: string },
) {
  const production = await sendApplePush('https://api.push.apple.com', credentials, deviceToken, eventId, input)
  if (production.ok || !/BadDeviceToken/i.test(production.body)) return production
  return sendApplePush('https://api.sandbox.push.apple.com', credentials, deviceToken, eventId, input)
}

export async function sendPocketPush(ownerId: string, eventId: string, input: { title: string; body: string; path: string; tag?: string }) {
  const serviceAccount = firebaseServiceAccount()
  const appleCredentials = applePushCredentials()
  if (!serviceAccount && !appleCredentials) return
  const snapshot = normalized(await readDurableJson<PocketPushStore>(STORE_KEY))
  const deliveryKey = ownerId + ':' + eventId
  if (snapshot.delivered[deliveryKey]) return
  const devices = Object.values(snapshot.devices).filter(device => device.ownerId === ownerId).slice(0, 500)
  if (!devices.length) return
  const accessToken = serviceAccount ? await firebaseAccessToken(serviceAccount) : ''
  const responses = await Promise.all(devices.map(async device => {
    if (device.platform === 'ios') {
      if (!appleCredentials) return { token: device.token, ok: false, body: 'Apple push is not configured.' }
      const result = await sendApplePushWithEnvironmentFallback(appleCredentials, device.token, eventId, input)
      return { token: device.token, ok: result.ok, body: result.body }
    }
    if (!serviceAccount) return { token: device.token, ok: false, body: 'Firebase push is not configured.' }
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: {
        token: device.token,
        notification: { title: input.title, body: input.body },
        data: { path: input.path, eventId },
        android: { priority: 'high', notification: { channel_id: 'pocket-payments', visibility: 'PRIVATE', ...(input.tag ? { tag: input.tag } : {}) } },
        apns: { payload: { aps: { sound: 'default' } } },
      } }),
    })
    return { token: device.token, ok: response.ok, body: response.ok ? '' : await response.text() }
  }))
  await mutateDurableJson<PocketPushStore>(STORE_KEY, current => {
    const store = normalized(current)
    const cutoff = Date.now() - 45 * 24 * 60 * 60_000
    Object.entries(store.delivered).forEach(([key, deliveredAt]) => { if (deliveredAt < cutoff) delete store.delivered[key] })
    if (responses.some(result => result.ok)) store.delivered[deliveryKey] = Date.now()
    responses.forEach(result => {
      if (!result.ok && /UNREGISTERED|registration-token-not-registered|invalid-registration-token|BadDeviceToken|DeviceTokenNotForTopic/i.test(result.body)) {
        delete store.devices[result.token]
      }
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
