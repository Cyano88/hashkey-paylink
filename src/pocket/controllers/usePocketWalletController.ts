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
import { deletePocketSecureWalletSession, PocketWalletSessionRecoveryRequiredError, readPocketSecureWalletSession, savePocketSecureWalletSession, secureSessionForNetwork } from '../lib/pocketSecureWalletSession'
import { pocketQuickApprovalCredentialSaved, readPocketEvmQuickSession } from '../lib/pocketQuickApproval'
import type { CirclePocketWallet } from '../models/pocketWallet'

export type PocketSolanaEmailSession = Awaited<ReturnType<typeof connectCircleSolanaEmailWallet>>
const sharedEvmSessions = new Map<string, CircleEvmEmailSession>()
const sharedPendingEvmSessions = new Map<string, Promise<CircleEvmEmailSession>>()
const sharedSolanaSessions = new Map<string, PocketSolanaEmailSession>()
const sharedPocketUnlocks = new Map<string, Promise<PocketWalletUnlock>>()
const sharedSessionRestores = new Map<string, Promise<CircleEvmEmailSession | null>>()

export type PocketWalletUnlock = {
  wallet: CirclePocketWallet
  session: CircleEvmEmailSession
}

function evmSessionKey(email: string, network: Exclude<PocketNetwork, 'solana'>, walletAddress: string) {
  return `${email.trim().toLowerCase()}:${network}:${walletAddress.toLowerCase()}`
}

function solanaSessionKey(email: string, walletAddress: string) {
  return `${email.trim().toLowerCase()}:solana:${walletAddress}`
}

function cacheEvmSession(email: string, session: CircleEvmEmailSession) {
  sharedEvmSessions.set(evmSessionKey(email, session.chain, session.wallet.address), session)
  if (session.chain === 'base' || session.chain === 'arbitrum') {
    const topology = session.productionEvmTopology?.wallets
    for (const network of ['base', 'arbitrum'] as const) {
      const wallet = topology?.[network]
      if (wallet) sharedEvmSessions.set(evmSessionKey(email, network, wallet.address), { ...session, chain: network, wallet })
    }
  }
}

export async function restorePocketWalletSession(email: string) {
  const key = email.trim().toLowerCase()
  const pending = sharedSessionRestores.get(key)
  if (pending) return pending
  const request = readPocketSecureWalletSession(email)
    .then(session => {
      if (session) cacheEvmSession(email, session)
      return session
    })
    .finally(() => sharedSessionRestores.delete(key))
  sharedSessionRestores.set(key, request)
  return request
}

export function activePocketEvmSession(
  email: string,
  network: Exclude<PocketNetwork, 'solana'>,
  walletAddress?: string,
) {
  if (walletAddress) return sharedEvmSessions.get(evmSessionKey(email, network, walletAddress)) ?? null
  const prefix = `${email.trim().toLowerCase()}:${network}:`
  return Array.from(sharedEvmSessions.entries()).find(([key]) => key.startsWith(prefix))?.[1] ?? null
}

async function connectFreshEvmSession(
  email: string,
  network: Exclude<PocketNetwork, 'solana'>,
  walletAddress: string,
) {
  const stored = await restorePocketWalletSession(email)
  const secured = stored ? secureSessionForNetwork(stored, network, walletAddress) : null
  if (secured) return secured
  if (stored) throw new PocketWalletSessionRecoveryRequiredError('The saved Circle session does not match this Pocket wallet. Reconnect it before making a payment.')
  if (await pocketQuickApprovalCredentialSaved(email)) {
    const migrated = await readPocketEvmQuickSession(email, network, walletAddress, { allowDisabled: true })
    if (migrated) {
      await savePocketSecureWalletSession(email, migrated)
      cacheEvmSession(email, migrated)
      return migrated
    }
  }
  const session = await connectCircleEvmEmailWallet(email, network)
  await savePocketSecureWalletSession(email, session)
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
    const storedSession = await readPocketSecureWalletSession(email)
    const session = storedSession
      ? await resumeCircleSolanaEmailWallet(storedSession)
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

async function unlockPocketBaseWalletOnce({
  authenticated,
  email,
  getAccessToken,
  forceReconnect = false,
}: {
  authenticated: boolean
  email: string
  getAccessToken: PocketAccessTokenReader
  forceReconnect?: boolean
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
  if (forceReconnect) await deletePocketSecureWalletSession(email)
  const storedSession = approvedSession || forceReconnect ? null : await readPocketSecureWalletSession(email)
  const secured = storedSession ? secureSessionForNetwork(storedSession, 'base', wallet.address) : null
  if (storedSession && !secured) throw new PocketWalletSessionRecoveryRequiredError('The saved Circle session does not match this Pocket wallet.')
  const session = approvedSession ?? secured ?? await connectCircleEvmEmailWallet(email, 'base')
  if (session.wallet.address.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error('The unlocked Circle wallet does not match this Pocket account.')
  }
  await savePocketSecureWalletSession(email, session)
  cacheEvmSession(email, session)
  return { wallet, session }
}

export async function unlockPocketBaseWallet(params: {
  authenticated: boolean
  email: string
  getAccessToken: PocketAccessTokenReader
}) {
  const key = params.email.trim().toLowerCase()
  const pending = sharedPocketUnlocks.get(key)
  if (pending) return pending
  const request = unlockPocketBaseWalletOnce(params)
    .finally(() => sharedPocketUnlocks.delete(key))
  sharedPocketUnlocks.set(key, request)
  return request
}

export async function reconnectPocketBaseWallet(params: {
  authenticated: boolean
  email: string
  getAccessToken: PocketAccessTokenReader
}) {
  return unlockPocketBaseWalletOnce({ ...params, forceReconnect: true })
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
        await savePocketSecureWalletSession(email, session)
        cacheEvmSession(email, session)
      },
      onSolanaSession: session => {
        setSolanaSession(session)
        sharedSolanaSessions.set(solanaSessionKey(email, session.wallet.address), session)
      },
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
    if (options.allowSharedSession) {
      if (currentSession && currentSession.chain === network && currentSession.wallet.address.toLowerCase() === walletAddress.toLowerCase()) return currentSession
      const shared = activePocketEvmSession(email, network, walletAddress)
      if (shared) return shared
    }
    const pending = sharedPendingEvmSessions.get(key)
    if (pending) return pending
    const request = connectFreshEvmSession(email, network, walletAddress)
      .then(session => {
        evmSessionRef.current = session
        setEvmSession(session)
        cacheEvmSession(email, session)
        return session
      })
      .finally(() => sharedPendingEvmSessions.delete(key))
    sharedPendingEvmSessions.set(key, request)
    return request
  }, [email, evmSession])

  const getSolanaSession = useCallback(async (walletAddress: string) => {
    if (solanaSession?.wallet.address === walletAddress) return solanaSession
    const shared = sharedSolanaSessions.get(solanaSessionKey(email, walletAddress))
    if (shared) return shared
    const activeAuthentication = activePocketEvmSession(email, 'base')
    const authentication = activeAuthentication ?? await readPocketSecureWalletSession(email)
    const session = authentication
      ? await resumeCircleSolanaEmailWallet(authentication, walletAddress)
      : await connectCircleSolanaEmailWallet(email)
    setSolanaSession(session)
    sharedSolanaSessions.set(solanaSessionKey(email, walletAddress), session)
    return session
  }, [email, solanaSession])

  return { ensureWallet, getEvmSession, getSolanaSession }
}
