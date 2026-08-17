import { Capacitor } from '@capacitor/core'
import { AccessControl, NativeBiometric } from '@capgo/capacitor-native-biometric'
import { refreshCircleEvmEmailSession, type CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import type { PocketNetwork } from './pocketSchemas'

const SESSION_PREFIX = 'pocket-wallet-session-v1:'
const SESSION_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000
const sessionOperations = new Map<string, Promise<unknown>>()

type StoredSessionPayload = {
  session: CircleEvmEmailSession
  savedAt: number
}

export async function pocketSecureWalletSessionAvailable(email: string) {
  if (!Capacitor.isNativePlatform() || !email) return false
  const saved = await NativeBiometric.isCredentialsSaved({ server: server(email) })
    .catch(() => ({ isSaved: false }))
  return saved.isSaved
}

function server(email: string) { return `com.hashpaylink.pocket.session.${email.trim().toLowerCase()}` }

export class PocketWalletSessionRecoveryRequiredError extends Error {
  constructor(message = 'Your Circle wallet session needs to be reconnected before making a payment.') {
    super(message)
    this.name = 'PocketWalletSessionRecoveryRequiredError'
  }
}

function withSessionLock<T>(email: string, operation: () => Promise<T>): Promise<T> {
  const key = email.trim().toLowerCase()
  const previous = sessionOperations.get(key) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(operation)
  sessionOperations.set(key, current)
  return current.finally(() => {
    if (sessionOperations.get(key) === current) sessionOperations.delete(key)
  })
}

async function saveSession(email: string, session: CircleEvmEmailSession) {
  if (!Capacitor.isNativePlatform() || !email) return
  if (!session.refreshToken || !session.deviceId) throw new Error('Circle did not return a renewable wallet session.')
  await NativeBiometric.setCredentials({
    server: server(email), username: email.trim().toLowerCase(),
    password: SESSION_PREFIX + JSON.stringify({ session, savedAt: Date.now() } satisfies StoredSessionPayload),
    accessControl: AccessControl.NONE,
  })
  const saved = await NativeBiometric.isCredentialsSaved({ server: server(email) })
  if (!saved.isSaved) throw new Error('Pocket could not securely retain the Circle wallet session.')
}

export async function savePocketSecureWalletSession(email: string, session: CircleEvmEmailSession) {
  return withSessionLock(email, () => saveSession(email, session))
}

export async function deletePocketSecureWalletSession(email: string) {
  if (!Capacitor.isNativePlatform() || !email) return
  await withSessionLock(email, () => NativeBiometric.deleteCredentials({ server: server(email) }).then(() => undefined).catch(() => undefined))
}

async function readSession(email: string) {
  if (!Capacitor.isNativePlatform() || !email) return null
  const key = server(email)
  const saved = await NativeBiometric.isCredentialsSaved({ server: key }).catch(() => ({ isSaved: false }))
  if (!saved.isSaved) return null
  // AccessControl.NONE is stored by the Android plugin as encrypted ordinary
  // credentials. getSecureCredentials only reads biometric-protected records
  // and therefore falsely reports this retained session as missing.
  const credentials = await NativeBiometric.getCredentials({ server: key }).catch(() => null)
  if (!credentials || credentials.username !== email.trim().toLowerCase() || !credentials.password.startsWith(SESSION_PREFIX)) {
    throw new PocketWalletSessionRecoveryRequiredError()
  }
  let stored: CircleEvmEmailSession
  let savedAt = 0
  try {
    const parsed = JSON.parse(credentials.password.slice(SESSION_PREFIX.length)) as CircleEvmEmailSession | StoredSessionPayload
    const wrapped = parsed && typeof parsed === 'object' && 'session' in parsed
    stored = wrapped ? parsed.session : parsed
    savedAt = wrapped && typeof parsed.savedAt === 'number' ? parsed.savedAt : 0
  } catch {
    throw new PocketWalletSessionRecoveryRequiredError()
  }
  if (!stored?.userToken || !stored?.encryptionKey || !stored?.wallet?.address) {
    throw new PocketWalletSessionRecoveryRequiredError()
  }
  if (savedAt > 0 && Date.now() - savedAt < SESSION_REFRESH_INTERVAL_MS) return stored
  try {
    const refreshed = await refreshCircleEvmEmailSession(stored)
    await saveSession(email, refreshed)
    return refreshed
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason ?? '')
    const invalidSession = /HTTP (?:401|403)|(?:refresh|user|session) token.{0,60}(?:invalid|expired|revoked|already used)|(?:invalid|expired|revoked).{0,60}(?:refresh|user|session) token|session credentials are invalid|unauthori[sz]ed/i.test(message)
    if (invalidSession) {
      throw new PocketWalletSessionRecoveryRequiredError()
    }
    if (stored) return stored
    return null
  }
}

export async function readPocketSecureWalletSession(email: string) {
  return withSessionLock(email, () => readSession(email))
}

export function secureSessionForNetwork(session: CircleEvmEmailSession, network: Exclude<PocketNetwork, 'solana'>, walletAddress: string) {
  const expected = walletAddress.toLowerCase()
  if (session.chain === network && session.wallet.address.toLowerCase() === expected) return session
  if (network === 'base' || network === 'arbitrum') {
    const wallet = session.productionEvmTopology?.wallets?.[network]
    if (wallet?.address.toLowerCase() === expected) return { ...session, chain: network, wallet }
  }
  return null
}
