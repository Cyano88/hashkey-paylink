import { PrivyClient } from '@privy-io/server-auth'
import { getAddress, isAddress } from 'viem'

type LinkedAccount = {
  type: string
  chainType?: string
  walletClientType?: string
  connectorType?: string
  address?: string
}
type VerifiedUser = { id: string; linkedAccounts: LinkedAccount[] }

function fail(message: string, status: number): never {
  throw Object.assign(new Error(message), { status })
}

// userId MUST come from a token verified against this same server-configured
// Privy app. Never accept an app ID, user ID or wallet ownership from the body.
// Email equality across apps is not proof of wallet ownership.
export async function verifyAgreementPrivyWallet(
  userId: string,
  address: unknown,
  env: NodeJS.ProcessEnv,
  load: (id: string) => Promise<VerifiedUser> = async id => {
    const appId = env.PRIVY_APP_ID || env.VITE_PRIVY_APP_ID
    if (!appId || !env.PRIVY_APP_SECRET) fail('Wallet verification is unavailable.', 503)
    return new PrivyClient(appId, env.PRIVY_APP_SECRET).getUserById(id)
  },
) {
  if (!userId || typeof address !== 'string' || !isAddress(address)) {
    fail('Your Agreement wallet is unavailable.', 400)
  }
  const user = await load(userId)
  if (user.id !== userId) fail('Wallet account mismatch.', 403)
  const wallets = user.linkedAccounts.filter(account => account.type === 'wallet'
    && account.chainType === 'ethereum' && account.walletClientType === 'privy'
    && account.connectorType === 'embedded')
  const wallet = wallets[0]
  if (wallets.length !== 1 || !wallet.address || !isAddress(wallet.address)
    || getAddress(wallet.address) !== getAddress(address)) {
    fail('Use your verified embedded wallet.', 403)
  }
  const normalized = getAddress(address)
  return { walletId: `privy:${normalized.toLowerCase()}`, address: normalized, chainId: 196 as const }
}
