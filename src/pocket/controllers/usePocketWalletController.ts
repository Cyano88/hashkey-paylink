import { useCallback, useState } from 'react'
import { PRIVY_AUTH_ENABLED } from '../../lib/authMode'
import {
  canUseCircleEvmEmailWallet,
  connectCircleEvmEmailWallet,
  type CircleEvmEmailSession,
} from '../../lib/circleEvmEmailWallet'
import {
  canUseCircleSolanaEmailWallet,
  connectCircleSolanaEmailWallet,
} from '../../lib/circleSolanaEmailWallet'
import { CHAIN_META } from '../../lib/chains'
import { linkPocketWallet, readPocketWallet } from '../api/pocketWalletLinkClient'
import type { PocketNetwork } from '../lib/pocketSchemas'
import type { CirclePocketWallet } from '../models/pocketWallet'

export type PocketSolanaEmailSession = Awaited<ReturnType<typeof connectCircleSolanaEmailWallet>>

type PocketAccessTokenReader = () => Promise<string | null>

type EnsurePocketWalletDependencies = {
  privyEnabled: boolean
  canUseEvm: typeof canUseCircleEvmEmailWallet
  canUseSolana: typeof canUseCircleSolanaEmailWallet
  readWallet: typeof readPocketWallet
  connectEvm: typeof connectCircleEvmEmailWallet
  connectSolana: typeof connectCircleSolanaEmailWallet
  linkWallet: typeof linkPocketWallet
}

const defaultDependencies: EnsurePocketWalletDependencies = {
  privyEnabled: PRIVY_AUTH_ENABLED,
  canUseEvm: canUseCircleEvmEmailWallet,
  canUseSolana: canUseCircleSolanaEmailWallet,
  readWallet: readPocketWallet,
  connectEvm: connectCircleEvmEmailWallet,
  connectSolana: connectCircleSolanaEmailWallet,
  linkWallet: linkPocketWallet,
}

export async function ensurePocketWallet({
  network,
  authenticated,
  email,
  getAccessToken,
  shouldContinue = () => true,
  onEvmSession,
  onSolanaSession,
}: {
  network: PocketNetwork
  authenticated: boolean
  email: string
  getAccessToken: PocketAccessTokenReader
  shouldContinue?: () => boolean
  onEvmSession?: (session: CircleEvmEmailSession) => void
  onSolanaSession?: (session: PocketSolanaEmailSession) => void
}, dependencies: EnsurePocketWalletDependencies = defaultDependencies): Promise<CirclePocketWallet | null> {
  if (!dependencies.privyEnabled) throw new Error('Circle Pocket requires Privy email sign-in.')
  if (!authenticated) throw new Error('Sign in with email to open Circle Pocket.')
  if (!email) throw new Error('Sign in with an email account to open Circle Pocket.')
  if (network === 'solana' && !dependencies.canUseSolana()) throw new Error('Circle Solana wallet is not configured.')
  if (network !== 'solana' && !dependencies.canUseEvm(network)) throw new Error(`${CHAIN_META[network].label} Circle wallet is not configured.`)

  const accessToken = await getAccessToken()
  if (!accessToken) throw new Error('Email session is not ready. Sign in again and retry.')
  const existing = await dependencies.readWallet({ accessToken, network })
  if (!shouldContinue()) return null
  if (existing?.wallet.address) {
    return {
      address: existing.wallet.address,
      walletId: existing.wallet.id,
      blockchain: existing.wallet.blockchain,
      updatedAt: existing.updatedAt,
    }
  }

  if (network === 'solana') {
    const session = await dependencies.connectSolana(email)
    if (!shouldContinue()) return null
    onSolanaSession?.(session)
    const linked = await dependencies.linkWallet({
      accessToken,
      network,
      circleUserToken: session.userToken,
      wallet: session.wallet,
    })
    return {
      address: session.wallet.address,
      walletId: session.wallet.id,
      blockchain: session.wallet.blockchain,
      updatedAt: linked.link?.updatedAt,
    }
  }

  const session = await dependencies.connectEvm(email, network)
  if (!shouldContinue()) return null
  onEvmSession?.(session)
  const linked = await dependencies.linkWallet({
    accessToken,
    network,
    circleUserToken: session.userToken,
    wallet: session.wallet,
  })
  return {
    address: session.wallet.address,
    walletId: session.wallet.id,
    blockchain: session.wallet.blockchain,
    updatedAt: linked.link?.updatedAt,
  }
}

export default function usePocketWalletController({
  authenticated,
  email,
  getAccessToken,
  onWalletReady,
}: {
  authenticated: boolean
  email: string
  getAccessToken: PocketAccessTokenReader
  onWalletReady?: (network: PocketNetwork, wallet: CirclePocketWallet) => void
}) {
  const [evmSession, setEvmSession] = useState<CircleEvmEmailSession | null>(null)
  const [solanaSession, setSolanaSession] = useState<PocketSolanaEmailSession | null>(null)

  const ensureWallet = useCallback(async (
    network: PocketNetwork,
    options: { shouldContinue?: () => boolean } = {},
  ) => {
    const wallet = await ensurePocketWallet({
      network,
      authenticated,
      email,
      getAccessToken,
      shouldContinue: options.shouldContinue,
      onEvmSession: setEvmSession,
      onSolanaSession: setSolanaSession,
    })
    if (wallet) onWalletReady?.(network, wallet)
    return wallet
  }, [authenticated, email, getAccessToken, onWalletReady])

  const getEvmSession = useCallback(async (
    network: Exclude<PocketNetwork, 'solana'>,
    walletAddress: string,
  ) => {
    if (evmSession && evmSession.chain === network && evmSession.wallet.address.toLowerCase() === walletAddress.toLowerCase()) {
      return evmSession
    }
    const session = await connectCircleEvmEmailWallet(email, network)
    setEvmSession(session)
    return session
  }, [email, evmSession])

  const getSolanaSession = useCallback(async (walletAddress: string) => {
    if (solanaSession?.wallet.address === walletAddress) return solanaSession
    const session = await connectCircleSolanaEmailWallet(email)
    setSolanaSession(session)
    return session
  }, [email, solanaSession])

  return { ensureWallet, getEvmSession, getSolanaSession }
}
