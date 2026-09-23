import { preparePocketWalletNetworks } from '../lib/pocketWalletBootstrap'
import { balanceOwner, readCachedPocketBalance, replacePocketBalanceWallets } from '../lib/pocketBalanceCache'
import { useCallback, useRef, useState } from 'react'
import { PRIVY_AUTH_ENABLED } from '../../lib/authMode'
import {
  canUseCircleEvmEmailWallet,
  connectCircleEvmEmailWallet,
  resumeCircleArcMainnetWallet,
  resumeCircleProductionEvmWallet,
  restoreActivatedCircleEvmSession,
  type CircleEvmEmailSession,
} from '../../lib/circleEvmEmailWallet'
import {
  canUseCircleSolanaEmailWallet,
  connectCircleSolanaEmailWallet,
  resumeCircleSolanaEmailWallet,
} from '../../lib/circleSolanaEmailWallet'
import { CHAIN_META } from '../../lib/chains'
import { linkPocketWallet, readPocketWallet, readPocketWallets } from '../api/pocketWalletLinkClient'
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
  if (session.chain === 'arc' && session.wallet.blockchain !== 'ARC') return
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
    .then(saved => {
      const session = saved ?? activePocketEvmSession(email, 'base')
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
  getAccessToken: PocketAccessTokenReader,
) {
  const stored = await restorePocketWalletSession(email)
  const secured = stored ? secureSessionForNetwork(stored, network, walletAddress) : null
  if (secured) return secured
  if (stored) {
    const token = await getAccessToken()
    if (!token) throw new PocketWalletSessionRecoveryRequiredError('Sign in again to restore your updated wallets.')
    const restored = await restoreActivatedCircleEvmSession(stored, token)
    const matching = secureSessionForNetwork(restored, network, walletAddress)
    if (!matching) throw new PocketWalletSessionRecoveryRequiredError('The updated session does not match this Pocket wallet.')
    await savePocketSecureWalletSession(email, restored)
    cacheEvmSession(email, restored)
    return matching
  }
  if (await pocketQuickApprovalCredentialSaved(email)) {
    const migrated = await readPocketEvmQuickSession(email, network, walletAddress, { allowDisabled: true })
    if (migrated) {
      await savePocketSecureWalletSession(email, migrated)
      cacheEvmSession(email, migrated)
      return migrated
    }
  }
  throw new PocketWalletSessionRecoveryRequiredError()
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
    const storedSession = await restorePocketWalletSession(email)
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
    })
    return {
      address: session.wallet.address,
      walletId: session.wallet.id,
      blockchain: session.wallet.blockchain,
      updatedAt: linked?.link?.updatedAt,
    }
  }

  const storedSession = await restorePocketWalletSession(email)
  const storedWallet = storedSession?.chain === network
    ? storedSession.wallet
    : network === 'base' || network === 'arbitrum'
      ? storedSession?.productionEvmTopology?.wallets?.[network]
      : null
  const resumedSession = storedSession && storedWallet
    ? secureSessionForNetwork(storedSession, network as Exclude<PocketNetwork, 'solana'>, storedWallet.address)
    : null
  const mainnetSession = network === 'arc' ? await restorePocketWalletSession(email) : null
  const session = resumedSession ?? (mainnetSession && mainnetSession.wallet.blockchain !== 'ARC-TESTNET' ? await resumeCircleArcMainnetWallet(mainnetSession) : await dependencies.connectEvm(email, network))
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
  })))
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
  shouldContinue = () => true,
}: {
  authenticated: boolean
  email: string
  getAccessToken: PocketAccessTokenReader
  forceReconnect?: boolean
  shouldContinue?: () => boolean
}) {
  let approvedSession: CircleEvmEmailSession | null = null
  const wallet = await ensurePocketWallet({
    network: 'base',
    authenticated,
    email,
    getAccessToken,
    shouldContinue,
    onEvmSession: async session => {
      approvedSession = session
      await savePocketSecureWalletSession(email, session)
      cacheEvmSession(email, session)
    },
  })
  if (!wallet || !shouldContinue()) throw new Error('Circle wallet unlock did not complete.')
  if (forceReconnect) await deletePocketSecureWalletSession(email)
  const storedSession = approvedSession || forceReconnect ? null : await restorePocketWalletSession(email)
  const secured = storedSession ? secureSessionForNetwork(storedSession, 'base', wallet.address) : null
  let session = approvedSession ?? secured ?? storedSession ?? await connectCircleEvmEmailWallet(email, 'base')
  if (!shouldContinue()) throw new Error('Wallet setup cancelled.')
  if (session.wallet.address.toLowerCase() !== wallet.address.toLowerCase() || (wallet.walletId && session.wallet.id !== wallet.walletId)) {
    const token = await getAccessToken()
    if (!token) throw new PocketWalletSessionRecoveryRequiredError('Sign in again to restore your updated wallets.')
    const restored = await restoreActivatedCircleEvmSession(session, token)
    const matching = secureSessionForNetwork(restored, 'base', wallet.address)
    if (!matching || (wallet.walletId && matching.wallet.id !== wallet.walletId)) throw new PocketWalletSessionRecoveryRequiredError('The updated session does not match this Pocket wallet.')
    session = matching
  }
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

const sharedWalletPreparation = new Map<string, { work: Promise<CircleEvmEmailSession>; active: () => boolean }>()
export async function preparePocketWalletsAfterSignIn(params: {
  email: string; getAccessToken: PocketAccessTokenReader; session: CircleEvmEmailSession; shouldContinue?: () => boolean
}): Promise<CircleEvmEmailSession> {
  const owner = balanceOwner(params.email)
  const active = params.shouldContinue ?? (() => true)
  const pending = sharedWalletPreparation.get(owner)
  if (pending) {
    try { return await pending.work } catch (error) {
      if (pending.active() || !active()) throw error
      return preparePocketWalletsAfterSignIn(params)
    }
  }
  const work = (async () => {
    const token = await params.getAccessToken()
    if (!token || !active()) throw new Error('Sign in again to finish wallet setup.')
    const result = await preparePocketWalletNetworks(params.session, {
      read: () => readPocketWallets({ accessToken: token }),
      evm: resumeCircleProductionEvmWallet,
      arc: resumeCircleArcMainnetWallet,
      solana: resumeCircleSolanaEmailWallet,
      link: (network, candidate) => linkPocketWallet({ accessToken: token, network, circleUserToken: candidate.userToken, wallet: candidate.wallet }),
      save: complete => savePocketSecureWalletSession(params.email, complete),
    }, active)
    if (!active()) throw new Error('Wallet setup cancelled.')
    cacheEvmSession(params.email, result.session)
    if (result.session.arcMainnetWallet) cacheEvmSession(params.email, { ...result.session, chain: 'arc', wallet: result.session.arcMainnetWallet })
    sharedSolanaSessions.set(solanaSessionKey(params.email, result.solana.wallet.address), result.solana as PocketSolanaEmailSession)
    const previous = readCachedPocketBalance(owner)?.wallets
    if (JSON.stringify(previous) !== JSON.stringify(result.wallets)) await replacePocketBalanceWallets(owner, result.wallets)
    return result.session
  })().finally(() => sharedWalletPreparation.delete(owner))
  sharedWalletPreparation.set(owner, { work, active })
  return work
}

export async function reconnectPocketBaseWallet(params: {
  authenticated: boolean
  email: string
  getAccessToken: PocketAccessTokenReader
  shouldContinue?: () => boolean
}) {
  // Retry an interrupted setup with the retained session, without another OTP.
  const retained = await restorePocketWalletSession(params.email).catch(() => null)
  const unlocked = await unlockPocketBaseWalletOnce({ ...params, forceReconnect: !retained })
  const session = await preparePocketWalletsAfterSignIn({ ...params, session: unlocked.session })
  return { ...unlocked, session }
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
    const request = connectFreshEvmSession(email, network, walletAddress, getAccessToken)
      .then(session => {
        evmSessionRef.current = session
        setEvmSession(session)
        cacheEvmSession(email, session)
        return session
      })
      .finally(() => sharedPendingEvmSessions.delete(key))
    sharedPendingEvmSessions.set(key, request)
    return request
  }, [email, evmSession, getAccessToken])

  const getSolanaSession = useCallback(async (walletAddress: string) => {
    if (solanaSession?.wallet.address === walletAddress) return solanaSession
    const shared = sharedSolanaSessions.get(solanaSessionKey(email, walletAddress))
    if (shared) return shared
    const activeAuthentication = activePocketEvmSession(email, 'base')
    const authentication = activeAuthentication ?? await restorePocketWalletSession(email)
    const session = authentication
      ? await resumeCircleSolanaEmailWallet(authentication, walletAddress)
      : await connectCircleSolanaEmailWallet(email)
    setSolanaSession(session)
    sharedSolanaSessions.set(solanaSessionKey(email, walletAddress), session)
    return session
  }, [email, solanaSession])

  return { ensureWallet, getEvmSession, getSolanaSession }
}
