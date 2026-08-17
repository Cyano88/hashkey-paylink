import { Capacitor } from '@capacitor/core'
import {
  AccessControl,
  NativeBiometric,
  type AvailableResult,
} from '@capgo/capacitor-native-biometric'
import {
  refreshCircleEvmEmailSession,
  type CircleEvmEmailSession,
} from '../../lib/circleEvmEmailWallet'
import type { PocketNetwork } from './pocketSchemas'

const ENABLED_KEY = 'pocket:quick-approval:enabled:v1'

function serverKey(email: string) {
  return `com.hashpaylink.pocket.circle.${email.trim().toLowerCase()}`
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

export async function pocketQuickApprovalAvailability(): Promise<AvailableResult | null> {
  if (!Capacitor.isNativePlatform()) return null
  return NativeBiometric.isAvailable({ useFallback: false }).catch(() => null)
}

async function storePocketEvmQuickSession(email: string, session: CircleEvmEmailSession) {
  await NativeBiometric.setCredentials({
    server: serverKey(email),
    username: email.trim().toLowerCase(),
    password: JSON.stringify(session),
    accessControl: AccessControl.BIOMETRY_CURRENT_SET,
    title: 'Approve Pocket payments',
    negativeButtonText: 'Cancel',
  })
}

export async function enablePocketQuickApproval(email: string, session: CircleEvmEmailSession) {
  if (!email || !session.userToken || !session.encryptionKey) {
    throw new Error('Complete Circle email verification before enabling payment approval.')
  }
  const available = await pocketQuickApprovalAvailability()
  if (!available?.isAvailable || !available.strongBiometryIsAvailable) {
    throw new Error('Fingerprint or face unlock is not available on this phone.')
  }
  await NativeBiometric.verifyIdentity({
    title: 'Enable payment approval',
    subtitle: 'Pocket',
    description: 'Confirm it is you to approve future payments with fingerprint or face.',
    negativeButtonText: 'Cancel',
    useFallback: false,
    maxAttempts: 3,
  })
  await storePocketEvmQuickSession(email, session)
  window.localStorage.setItem(ENABLED_KEY, 'true')
}

export async function disablePocketQuickApproval(email: string) {
  window.localStorage.setItem(ENABLED_KEY, 'false')
  if (!Capacitor.isNativePlatform() || !email) return
  await NativeBiometric.deleteCredentials({ server: serverKey(email) }).catch(() => undefined)
}

export async function offerPocketQuickApprovalAfterEmail(email: string, session: CircleEvmEmailSession) {
  if (!shouldOfferPocketQuickApproval()) return false
  const available = await pocketQuickApprovalAvailability()
  if (!available?.isAvailable || !available.strongBiometryIsAvailable) return false
  try {
    await enablePocketQuickApproval(email, session)
    return true
  } catch {
    // A dismissed biometric prompt is a deliberate choice. The user can
    // enable it later from Profile without blocking the payment in progress.
    window.localStorage.setItem(ENABLED_KEY, 'false')
    return false
  }
}

export async function savePocketEvmQuickSession(email: string, session: CircleEvmEmailSession) {
  if (!pocketQuickApprovalEnabled() || !session.userToken || !session.encryptionKey) return
  await storePocketEvmQuickSession(email, session)
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
) {
  if (!pocketQuickApprovalEnabled()) return null
  const session = await readPocketQuickApprovalSession(email)
  if (!session) throw new PocketBiometricApprovalError('Fingerprint approval is required before paying.')
  const networkSession = sessionForNetwork(session, network, walletAddress)
  if (!networkSession) {
    throw new PocketBiometricApprovalError('This wallet is not bound to fingerprint approval. Re-enable fingerprint in Profile before paying.')
  }
  return networkSession
}

export async function readPocketQuickApprovalSession(email: string) {
  if (!pocketQuickApprovalEnabled()) return null
  const key = serverKey(email)
  const saved = await NativeBiometric.isCredentialsSaved({ server: key }).catch(() => ({ isSaved: false }))
  if (!saved.isSaved) {
    throw new PocketBiometricApprovalError('Fingerprint approval needs to be re-enabled in Profile. No payment was started.')
  }
  let credentials
  try {
    credentials = await NativeBiometric.getSecureCredentials({
      server: key,
      title: 'Approve with fingerprint',
      subtitle: 'Pocket payment',
      description: 'Confirm it is you to authorize this payment.',
      negativeButtonText: 'Cancel payment',
    })
  } catch {
    throw new PocketBiometricApprovalError('Fingerprint approval was cancelled. Nothing was sent.')
  }
  if (!credentials || credentials.username !== email.trim().toLowerCase()) {
    throw new PocketBiometricApprovalError('Fingerprint approval does not match this Pocket account. Nothing was sent.')
  }
  try {
    const storedSession = JSON.parse(credentials.password) as CircleEvmEmailSession
    if (!storedSession.refreshToken || !storedSession.deviceId) {
      throw new Error('Stored Circle session cannot be refreshed.')
    }
    const session = await refreshCircleEvmEmailSession(storedSession)
    await savePocketEvmQuickSession(email, session)
    return session
  } catch {
    throw new PocketBiometricApprovalError('Fingerprint was accepted, but payment approval needs to be re-enabled in Profile. Nothing was sent.')
  }
}
