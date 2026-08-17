import { Capacitor } from '@capacitor/core'
import { AccessControl, NativeBiometric } from '@capgo/capacitor-native-biometric'
import { refreshCircleEvmEmailSession, type CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import type { PocketNetwork } from './pocketSchemas'

const SESSION_PREFIX = 'pocket-wallet-session-v1:'
function server(email: string) { return `com.hashpaylink.pocket.session.${email.trim().toLowerCase()}` }

export async function savePocketSecureWalletSession(email: string, session: CircleEvmEmailSession) {
  if (!Capacitor.isNativePlatform() || !email || !session.refreshToken || !session.deviceId) return
  await NativeBiometric.setCredentials({
    server: server(email), username: email.trim().toLowerCase(), password: SESSION_PREFIX + JSON.stringify(session),
    accessControl: AccessControl.NONE,
  })
}

export async function deletePocketSecureWalletSession(email: string) {
  if (!Capacitor.isNativePlatform() || !email) return
  await NativeBiometric.deleteCredentials({ server: server(email) }).catch(() => undefined)
}

export async function readPocketSecureWalletSession(email: string) {
  if (!Capacitor.isNativePlatform() || !email) return null
  try {
    const saved = await NativeBiometric.isCredentialsSaved({ server: server(email) })
    if (!saved.isSaved) return null
    const credentials = await NativeBiometric.getSecureCredentials({ server: server(email) })
    if (credentials.username !== email.trim().toLowerCase() || !credentials.password.startsWith(SESSION_PREFIX)) return null
    const stored = JSON.parse(credentials.password.slice(SESSION_PREFIX.length)) as CircleEvmEmailSession
    const refreshed = await refreshCircleEvmEmailSession(stored)
    await savePocketSecureWalletSession(email, refreshed)
    return refreshed
  } catch {
    await deletePocketSecureWalletSession(email)
    return null
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
