import { Capacitor } from '@capacitor/core'
import {
  AccessControl,
  NativeBiometric,
  type AvailableResult,
} from '@capgo/capacitor-native-biometric'
import type { CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import type { PocketNetwork } from './pocketSchemas'

const ENABLED_KEY = 'pocket:quick-approval:enabled:v1'
const UNLOCK_WINDOW_MS = 60_000
const unlocked = new Map<string, { session: CircleEvmEmailSession; until: number }>()

function serverKey(email: string) {
  return `com.hashpaylink.pocket.circle.${email.trim().toLowerCase()}`
}

function tokenIsUsable(token: string) {
  try {
    const payload = token.split('.')[1]
    if (!payload) return true
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(window.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as { exp?: number }
    return !decoded.exp || decoded.exp * 1_000 > Date.now() + 5 * 60_000
  } catch {
    return true
  }
}

export function pocketQuickApprovalEnabled() {
  return Capacitor.isNativePlatform() && window.localStorage.getItem(ENABLED_KEY) === 'true'
}

export async function pocketQuickApprovalAvailability(): Promise<AvailableResult | null> {
  if (!Capacitor.isNativePlatform()) return null
  return NativeBiometric.isAvailable({ useFallback: false }).catch(() => null)
}

export async function enablePocketQuickApproval() {
  const available = await pocketQuickApprovalAvailability()
  if (!available?.isAvailable || !available.strongBiometryIsAvailable) {
    throw new Error('Fingerprint or face unlock is not available on this phone.')
  }
  await NativeBiometric.verifyIdentity({
    title: 'Enable phone unlock',
    subtitle: 'Pocket payments',
    description: 'Confirm it is you to enable faster payment approval.',
    negativeButtonText: 'Cancel',
    useFallback: false,
    maxAttempts: 3,
  })
  window.localStorage.setItem(ENABLED_KEY, 'true')
}

export async function disablePocketQuickApproval(email: string) {
  window.localStorage.removeItem(ENABLED_KEY)
  unlocked.clear()
  if (!Capacitor.isNativePlatform() || !email) return
  await NativeBiometric.deleteCredentials({ server: serverKey(email) }).catch(() => undefined)
}

export async function savePocketEvmQuickSession(email: string, session: CircleEvmEmailSession) {
  if (!pocketQuickApprovalEnabled() || !session.userToken || !session.encryptionKey) return
  await NativeBiometric.setCredentials({
    server: serverKey(email),
    username: email.trim().toLowerCase(),
    password: JSON.stringify(session),
    accessControl: AccessControl.BIOMETRY_CURRENT_SET,
    title: 'Enable phone unlock',
    negativeButtonText: 'Use email code',
  })
  unlocked.set(serverKey(email), { session, until: Date.now() + UNLOCK_WINDOW_MS })
}

export async function readPocketEvmQuickSession(
  email: string,
  network: Exclude<PocketNetwork, 'solana'>,
  walletAddress: string,
) {
  if (!pocketQuickApprovalEnabled()) return null
  const key = serverKey(email)
  const cached = unlocked.get(key)
  if (
    cached &&
    cached.until > Date.now() &&
    cached.session.chain === network &&
    cached.session.wallet.address.toLowerCase() === walletAddress.toLowerCase() &&
    tokenIsUsable(cached.session.userToken)
  ) return cached.session

  const saved = await NativeBiometric.isCredentialsSaved({ server: key }).catch(() => ({ isSaved: false }))
  if (!saved.isSaved) return null
  const credentials = await NativeBiometric.getSecureCredentials({
    server: key,
    title: 'Approve with phone unlock',
    subtitle: 'Pocket payment',
    description: 'Confirm it is you to continue.',
    negativeButtonText: 'Use email code',
  }).catch(() => null)
  if (!credentials || credentials.username !== email.trim().toLowerCase()) return null
  try {
    const session = JSON.parse(credentials.password) as CircleEvmEmailSession
    if (
      session.chain !== network ||
      session.wallet?.address?.toLowerCase() !== walletAddress.toLowerCase() ||
      !tokenIsUsable(session.userToken)
    ) return null
    unlocked.set(key, { session, until: Date.now() + UNLOCK_WINDOW_MS })
    return session
  } catch {
    return null
  }
}
