import { useCallback, useRef, useState } from 'react'
import { PRIVY_AUTH_ENABLED } from '../../lib/authMode'
import {
  canUseCircleEvmEmailWallet,
  connectCircleEvmEmailWallet,
  type CircleEvmEmailSession,
} from '../../lib/circleEvmEmailWallet'
import {
  canUseCircleSolanaEmailWallet,
  connectCircleSolanaEmailWallet,
  resumeCircleSolanaEmailWallet,
} from '../../lib/circleSolanaEmailWallet'
import { CHAIN_META } from '../../lib/chains'
import { linkPocketWallet, readPocketWallet } from '../api/pocketWalletLinkClient'
import type { PocketNetwork } from '../lib/pocketSchemas'
import {
  pocketQuickApprovalEnabled,
  offerPocketQuickApprovalAfterEmail,
  readPocketEvmQuickSession,
  readPocketQuickApprovalSession,
  savePocketEvmQuickSession,
} from '../lib/pocketQuickApproval'
import type { CirclePocketWallet } from '../models/pocketWallet'

export type PocketSolanaEmailSession = Awaited<ReturnType<typeof connectCircleSolanaEmailWallet>>
const sharedEvmSessions = new Map<string, CircleEvmEmailSession>()
const sharedPendingEvmSessions = new Map<string, Promise<CircleEvmEmailSession>>()

function evmSessionKey(email: string, network: Exclude<PocketNetwork, 'solana'>, walletAddress: string) {
  return `${email.trim().toLowerCase()}:${network}:${walletAddress.toLowerCase()}`
}

async function connectFreshEvmSession(
  email: string,
  network: Exclude<PocketNetwork, 'solana'>,
  walletAddress: string,
) {
  if (pocketQuickApprovalEnabled()) {
    const secured = await readPocketEvmQuickSession(email, network, walletAddress)
    if (!secured) throw new Error('Fingerprint approval is required before paying.')
    return secured
  }
  const session = await connectCircleEvmEmailWallet(email, network)
  await offerPocketQuickApprovalAfterEmail(email, session).catch(() => false)
  await savePocketEvmQuickSession(email, session).catch(() => undefined)
  return session
}

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
  onEvmSession?: (session: CircleEvmEmailSession) => void | Promise<void>
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
    const quickSession = pocketQuickApprovalEnabled() ? await readPocketQuickApprovalSession(email) : null
    const session = quickSession
      ? await resumeCircleSolanaEmailWallet(quickSession)
      : await dependencies.connectSolana(email)
    if (!shouldContinue()) return null
    onSolanaSession?.(session)
    const linked = await dependencies.linkWallet({
      accessToken,
      network,
      circleUserToken: session.userToken,
      wallet: session.wallet,
    }).catch(() => null)
    return {
      address: session.wallet.address,
      walletId: session.wallet.id,
      blockchain: session.wallet.blockchain,
      updatedAt: linked?.link?.updatedAt,
    }
  }

  const session = await dependencies.connectEvm(email, network)
  if (!shouldContinue()) return null
  await onEvmSession?.(session)
  const productionWallets = session.productionEvmTopology?.wallets
  const linkTargets = network !== 'arc' && productionWallets?.base && productionWallets.arbitrum
    ? ([['base', productionWallets.base], ['arbitrum', productionWallets.arbitrum]] as const)
    : ([[network, session.wallet]] as const)
  const linkedRecords = await Promise.all(linkTargets.map(([targetNetwork, wallet]) => dependencies.linkWallet({
    accessToken,
    network: targetNetwork,
    circleUserToken: session.userToken,
    wallet,
  }).catch(() => null)))
  const linked = linkedRecords[linkTargets.findIndex(([targetNetwork]) => targetNetwork === network)] ?? linkedRecords.find(Boolean)
  return {
    address: session.wallet.address,
    walletId: session.wallet.id,
    blockchain: session.wallet.blockchain,
    updatedAt: linked?.link?.updatedAt,
  }
}

export async function unlockPocketBaseWallet({
  authenticated,
  email,
  getAccessToken,
}: {
  authenticated: boolean
  email: string
  getAccessToken: PocketAccessTokenReader
}) {
  let approvedSession: CircleEvmEmailSession | null = null
  const wallet = await ensurePocketWallet({
    network: 'base',
    authenticated,
    email,
    getAccessToken,
    onEvmSession: session => { approvedSession = session },
  })
  if (!wallet) throw new Error('Circle wallet unlock did not complete.')
  const session = approvedSession ?? (pocketQuickApprovalEnabled()
    ? await readPocketEvmQuickSession(email, 'base', wallet.address)
    : await connectCircleEvmEmailWallet(email, 'base'))
  if (session.wallet.address.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error('The unlocked Circle wallet does not match this Pocket account.')
  }
  await offerPocketQuickApprovalAfterEmail(email, session).catch(() => false)
  await savePocketEvmQuickSession(email, session).catch(() => undefined)
  sharedEvmSessions.set(evmSessionKey(email, 'base', wallet.address), session)
  return wallet
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
  const evmSessionRef = useRef<CircleEvmEmailSession | null>(null)
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
      onEvmSession: async session => {
        evmSessionRef.current = session
        setEvmSession(session)
        await offerPocketQuickApprovalAfterEmail(email, session).catch(() => false)
        await savePocketEvmQuickSession(email, session).catch(() => undefined)
      },
      onSolanaSession: setSolanaSession,
    })
    if (wallet) onWalletReady?.(network, wallet)
    return wallet
  }, [authenticated, email, getAccessToken, onWalletReady])

  const getEvmSession = useCallback(async (
    network: Exclude<PocketNetwork, 'solana'>,
    walletAddress: string,
    options: { allowSharedSession?: boolean } = { allowSharedSession: true },
  ) => {
    const currentSession = evmSessionRef.current ?? evmSession
    const key = evmSessionKey(email, network, walletAddress)
    if (!pocketQuickApprovalEnabled() && options.allowSharedSession) {
      if (currentSession && currentSession.chain === network && currentSession.wallet.address.toLowerCase() === walletAddress.toLowerCase()) return currentSession
      const shared = sharedEvmSessions.get(key)
      if (shared) return shared
    }
    const pending = sharedPendingEvmSessions.get(key)
    if (pending) return pending
    const request = connectFreshEvmSession(email, network, walletAddress)
      .then(session => {
        evmSessionRef.current = session
        setEvmSession(session)
        sharedEvmSessions.set(key, session)
        return session
      })
      .finally(() => sharedPendingEvmSessions.delete(key))
    sharedPendingEvmSessions.set(key, request)
    return request
  }, [email, evmSession])

  const getSolanaSession = useCallback(async (walletAddress: string) => {
    if (!pocketQuickApprovalEnabled() && solanaSession?.wallet.address === walletAddress) return solanaSession
    if (pocketQuickApprovalEnabled()) {
      const authentication = await readPocketQuickApprovalSession(email)
      if (!authentication) throw new Error('Fingerprint approval is required before paying.')
      const session = await resumeCircleSolanaEmailWallet(authentication, walletAddress)
      setSolanaSession(session)
      return session
    }
    const session = await connectCircleSolanaEmailWallet(email)
    setSolanaSession(session)
    return session
  }, [email, solanaSession])

  return { ensureWallet, getEvmSession, getSolanaSession }
}
