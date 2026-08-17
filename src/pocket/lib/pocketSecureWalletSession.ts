import { Capacitor } from '@capacitor/core'
import { AccessControl, NativeBiometric } from '@capgo/capacitor-native-biometric'
import { refreshCircleEvmEmailSession, type CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import type { PocketNetwork } from './pocketSchemas'

const SESSION_PREFIX = 'pocket-wallet-session-v1:'
const SESSION_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000

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

export async function savePocketSecureWalletSession(email: string, session: CircleEvmEmailSession) {
  if (!Capacitor.isNativePlatform() || !email || !session.refreshToken || !session.deviceId) return
  await NativeBiometric.setCredentials({
    server: server(email), username: email.trim().toLowerCase(),
    password: SESSION_PREFIX + JSON.stringify({ session, savedAt: Date.now() } satisfies StoredSessionPayload),
    accessControl: AccessControl.NONE,
  })
}

export async function deletePocketSecureWalletSession(email: string) {
  if (!Capacitor.isNativePlatform() || !email) return
  await NativeBiometric.deleteCredentials({ server: server(email) }).catch(() => undefined)
}

export async function readPocketSecureWalletSession(email: string) {
  if (!Capacitor.isNativePlatform() || !email) return null
  let stored: CircleEvmEmailSession | null = null
  try {
    const saved = await NativeBiometric.isCredentialsSaved({ server: server(email) })
    if (!saved.isSaved) return null
    const credentials = await NativeBiometric.getSecureCredentials({ server: server(email) })
    if (credentials.username !== email.trim().toLowerCase() || !credentials.password.startsWith(SESSION_PREFIX)) return null
    const parsed = JSON.parse(credentials.password.slice(SESSION_PREFIX.length)) as CircleEvmEmailSession | StoredSessionPayload
    const wrapped = parsed && typeof parsed === 'object' && 'session' in parsed
    stored = wrapped ? parsed.session : parsed
    const savedAt = wrapped && typeof parsed.savedAt === 'number' ? parsed.savedAt : 0
    if (!stored?.userToken || !stored?.encryptionKey || !stored?.wallet?.address) return null
    if (savedAt > 0 && Date.now() - savedAt < SESSION_REFRESH_INTERVAL_MS) return stored
    const refreshed = await refreshCircleEvmEmailSession(stored)
    await savePocketSecureWalletSession(email, refreshed)
    return refreshed
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason ?? '')
    const invalidSession = /HTTP (?:401|403)|(?:refresh|user|session) token.{0,60}(?:invalid|expired|revoked|already used)|(?:invalid|expired|revoked).{0,60}(?:refresh|user|session) token|session credentials are invalid|unauthori[sz]ed/i.test(message)
    if (invalidSession) {
      await deletePocketSecureWalletSession(email)
      return null
    }
    if (stored) return stored
    throw new Error('Pocket could not refresh the secure wallet session. Check your connection and try again.')
  }
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
