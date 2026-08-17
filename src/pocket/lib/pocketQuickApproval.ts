import { Capacitor } from '@capacitor/core'
import {
  AccessControl, NativeBiometric, type AvailableResult,
} from '@capgo/capacitor-native-biometric'
import {
  refreshCircleEvmEmailSession,
  type CircleEvmEmailSession,
} from '../../lib/circleEvmEmailWallet'
import type { PocketNetwork } from './pocketSchemas'

const ENABLED_KEY = 'pocket:quick-approval:enabled:v1'
const SESSION_KEY_PREFIX = 'pocket:quick-approval:session:v2:'
const SECRET_PREFIX = 'pocket-key-v1:'
const activeSessionSecrets = new Map<string, Uint8Array>()

function serverKey(email: string) {
  return `com.hashpaylink.pocket.circle.${email.trim().toLowerCase()}`
}

function sessionKey(email: string) {
  return `${SESSION_KEY_PREFIX}${encodeURIComponent(email.trim().toLowerCase())}`
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return window.btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = window.atob(value)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

function cryptoBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

async function legacySecret(value: string) {
  return new Uint8Array(await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

async function encryptSession(email: string, secret: Uint8Array, session: CircleEvmEmailSession) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const key = await window.crypto.subtle.importKey('raw', cryptoBuffer(secret), 'AES-GCM', false, ['encrypt'])
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(session)),
  )
  window.localStorage.setItem(sessionKey(email), JSON.stringify({
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  }))
}

async function decryptSession(email: string, secret: Uint8Array) {
  const stored = window.localStorage.getItem(sessionKey(email))
  if (!stored) return null
  const envelope = JSON.parse(stored) as { iv?: string; ciphertext?: string }
  if (!envelope.iv || !envelope.ciphertext) return null
  const key = await window.crypto.subtle.importKey('raw', cryptoBuffer(secret), 'AES-GCM', false, ['decrypt'])
  const plaintext = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(envelope.iv) },
    key,
    base64ToBytes(envelope.ciphertext),
  )
  return JSON.parse(new TextDecoder().decode(plaintext)) as CircleEvmEmailSession
}

export class PocketBiometricApprovalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PocketBiometricApprovalError'
  }
}

export function pocketQuickApprovalEnabled() {
  return Capacitor.isNativePlatform() && window.localStorage.getItem(ENABLED_KEY) === 'true'
}

export function shouldOfferPocketQuickApproval() {
  return Capacitor.isNativePlatform() && window.localStorage.getItem(ENABLED_KEY) === null
}

export async function pocketQuickApprovalConfigured(email: string) {
  if (!pocketQuickApprovalEnabled() || !email) return false
  const saved = await NativeBiometric.isCredentialsSaved({ server: serverKey(email) })
    .catch(() => ({ isSaved: false }))
  return saved.isSaved
}

export async function pocketQuickApprovalCredentialSaved(email: string) {
  if (!Capacitor.isNativePlatform() || !email) return false
  const saved = await NativeBiometric.isCredentialsSaved({ server: serverKey(email) })
    .catch(() => ({ isSaved: false }))
  return saved.isSaved
}

export async function pocketQuickApprovalAvailability(): Promise<AvailableResult | null> {
  if (!Capacitor.isNativePlatform()) return null
  return NativeBiometric.isAvailable({ useFallback: false }).catch(() => null)
}

export async function enablePocketQuickApproval(email: string, session: CircleEvmEmailSession) {
  if (!email || !session.userToken || !session.encryptionKey) {
    throw new Error('Complete Circle email verification before turning on Pocket unlock.')
  }
  const available = await pocketQuickApprovalAvailability()
  if (!available?.isAvailable || !available.strongBiometryIsAvailable) {
    throw new Error('Fingerprint or face unlock is not available on this phone.')
  }
  const normalizedEmail = email.trim().toLowerCase()
  const secret = window.crypto.getRandomValues(new Uint8Array(32))
  await encryptSession(normalizedEmail, secret, session)
  try {
    // BIOMETRY_CURRENT_SET already authenticates while protecting the key on
    // Android. Calling verifyIdentity first creates a redundant second prompt.
    await NativeBiometric.setCredentials({
      server: serverKey(normalizedEmail),
      username: normalizedEmail,
      password: `${SECRET_PREFIX}${bytesToBase64(secret)}`,
      accessControl: AccessControl.BIOMETRY_CURRENT_SET,
      title: 'Turn on Pocket unlock',
      negativeButtonText: 'Not now',
    })
  } catch (reason) {
    window.localStorage.removeItem(sessionKey(normalizedEmail))
    throw reason
  }
  activeSessionSecrets.set(normalizedEmail, secret)
  window.localStorage.setItem(ENABLED_KEY, 'true')
}

export async function disablePocketQuickApproval(email: string) {
  window.localStorage.setItem(ENABLED_KEY, 'false')
  activeSessionSecrets.delete(email.trim().toLowerCase())
  window.localStorage.removeItem(sessionKey(email))
  if (!Capacitor.isNativePlatform() || !email) return
  await NativeBiometric.deleteCredentials({ server: serverKey(email) }).catch(() => undefined)
}

export function declinePocketQuickApproval() {
  window.localStorage.setItem(ENABLED_KEY, 'false')
}

export async function savePocketEvmQuickSession(email: string, session: CircleEvmEmailSession) {
  if (!pocketQuickApprovalEnabled() || !session.userToken || !session.encryptionKey) return
  const normalizedEmail = email.trim().toLowerCase()
  const secret = activeSessionSecrets.get(normalizedEmail)
  if (!secret) return
  await encryptSession(normalizedEmail, secret, session)
}

function sessionForNetwork(
  session: CircleEvmEmailSession,
  network: Exclude<PocketNetwork, 'solana'>,
  walletAddress: string,
) {
  const expectedAddress = walletAddress.toLowerCase()
  if (session.chain === network && session.wallet.address.toLowerCase() === expectedAddress) return session
  if (network === 'base' || network === 'arbitrum') {
    const wallet = session.productionEvmTopology?.wallets?.[network]
    if (wallet?.address?.toLowerCase() === expectedAddress) return { ...session, chain: network, wallet }
  }
  return null
}

export async function readPocketEvmQuickSession(
  email: string,
  network: Exclude<PocketNetwork, 'solana'>,
  walletAddress: string,
  options: { allowDisabled?: boolean } = {},
) {
  if (!options.allowDisabled && !pocketQuickApprovalEnabled()) return null
  const session = await readPocketQuickApprovalSession(email, options)
  if (!session) throw new PocketBiometricApprovalError('Fingerprint or face unlock is required to open Pocket.')
  const networkSession = sessionForNetwork(session, network, walletAddress)
  if (!networkSession) {
    throw new PocketBiometricApprovalError('This wallet is not available in your secure Pocket session. Sign in again to refresh it.')
  }
  return networkSession
}

export async function readPocketQuickApprovalSession(email: string, options: { allowDisabled?: boolean } = {}) {
  if (!options.allowDisabled && !pocketQuickApprovalEnabled()) return null
  const key = serverKey(email)
  const saved = await NativeBiometric.isCredentialsSaved({ server: key }).catch(() => ({ isSaved: false }))
  if (!saved.isSaved) {
    throw new PocketBiometricApprovalError('Fingerprint or face unlock needs to be set up again.')
  }
  let credentials
  try {
    credentials = await NativeBiometric.getSecureCredentials({
      server: key,
      title: 'Unlock Pocket',
      subtitle: 'Hash PayLink',
      description: 'Use fingerprint or face to open your wallets.',
      negativeButtonText: 'Cancel',
    })
  } catch {
    throw new PocketBiometricApprovalError('Pocket unlock was cancelled.')
  }
  if (!credentials || credentials.username !== email.trim().toLowerCase()) {
    throw new PocketBiometricApprovalError('This phone unlock does not match your Pocket account.')
  }
  try {
    const normalizedEmail = email.trim().toLowerCase()
    const modernCredential = credentials.password.startsWith(SECRET_PREFIX)
    const secret = modernCredential
      ? base64ToBytes(credentials.password.slice(SECRET_PREFIX.length))
      : await legacySecret(credentials.password)
    const storedSession = modernCredential
      ? await decryptSession(normalizedEmail, secret)
      : await decryptSession(normalizedEmail, secret).catch(() => null)
        ?? JSON.parse(credentials.password) as CircleEvmEmailSession
    if (!storedSession) throw new Error('Stored Circle session is unavailable.')
    if (!storedSession.refreshToken || !storedSession.deviceId) {
      throw new Error('Stored Circle session cannot be refreshed.')
    }
    activeSessionSecrets.set(normalizedEmail, secret)
    const session = await refreshCircleEvmEmailSession(storedSession)
    await encryptSession(normalizedEmail, secret, session)
    return session
  } catch {
    throw new PocketBiometricApprovalError('Your secure wallet session needs to be refreshed with an email code.')
  }
}
