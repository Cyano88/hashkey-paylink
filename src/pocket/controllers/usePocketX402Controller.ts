import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  activatePocketX402Gateway,
  connectPocketX402Wallet,
  PocketX402ConnectionError,
  readPocketX402Snapshot,
} from '../api/pocketX402Client'
import { createPocketIdempotencyKey, type PocketX402SnapshotData, type PocketX402WalletChoice } from '../lib/pocketSchemas'
import { normalizePocketX402Amount, pocketX402ActivationError } from './pocketX402Validation'

type PocketX402Network = 'base' | 'arc'
type PocketX402WalletMode = 'create' | 'login'
type PocketX402WalletStep = 'idle' | 'otp' | 'done'

const pocketX402SnapshotCache = new Map<string, PocketX402SnapshotData>()
const pocketX402SnapshotRequests = new Map<string, Promise<PocketX402SnapshotData>>()

function x402CacheKey(email: string, network: PocketX402Network) {
  return `${email}:${network}`
}

async function loadPocketX402Snapshot(params: {
  email: string
  network: PocketX402Network
  getAccessToken: () => Promise<string | null>
  force?: boolean
}) {
  const key = x402CacheKey(params.email, params.network)
  const cached = pocketX402SnapshotCache.get(key)
  if (cached && !params.force) return cached
  const running = pocketX402SnapshotRequests.get(key)
  if (running) return running
  const request = (async () => {
    const accessToken = await params.getAccessToken()
    if (!accessToken) throw new Error('Sign in again to view x402 balances.')
    const snapshot = await readPocketX402Snapshot({ accessToken, network: params.network })
    pocketX402SnapshotCache.set(key, snapshot)
    return snapshot
  })().finally(() => pocketX402SnapshotRequests.delete(key))
  pocketX402SnapshotRequests.set(key, request)
  return request
}

export async function prefetchPocketX402Snapshot(params: {
  authenticated: boolean
  email: string
  getAccessToken: () => Promise<string | null>
}) {
  if (!params.authenticated || !params.email) return
  await loadPocketX402Snapshot({ email: params.email, network: 'base', getAccessToken: params.getAccessToken })
}

function readableError(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback
}

export default function usePocketX402Controller({
  authenticated,
  email,
  getAccessToken,
}: {
  authenticated: boolean
  email: string
  getAccessToken: () => Promise<string | null>
}) {
  const [network, setNetworkState] = useState<PocketX402Network>('base')
  const [snapshot, setSnapshot] = useState<PocketX402SnapshotData | null>(() => pocketX402SnapshotCache.get(x402CacheKey(email, 'base')) ?? null)
  const [snapshotReady, setSnapshotReady] = useState(() => !authenticated || !email || pocketX402SnapshotCache.has(x402CacheKey(email, 'base')))
  const [refreshing, setRefreshing] = useState(false)
  const [walletMode, setWalletMode] = useState<PocketX402WalletMode>('create')
  const [walletStep, setWalletStep] = useState<PocketX402WalletStep>('idle')
  const [otp, setOtp] = useState('')
  const [otpNetwork, setOtpNetwork] = useState<PocketX402Network | null>(null)
  const [expectedWallet, setExpectedWallet] = useState('')
  const [walletChoices, setWalletChoices] = useState<PocketX402WalletChoice[]>([])
  const [walletBusy, setWalletBusy] = useState(false)
  const [error, setError] = useState('')
  const [amount, setAmountState] = useState('0.5')
  const [activationOpen, setActivationOpen] = useState(false)
  const [activationBusy, setActivationBusy] = useState(false)
  const [activationSuccess, setActivationSuccess] = useState('')
  const [activationPending, setActivationPending] = useState(false)
  const activationKey = useRef('')
  const activationTargetBalance = useRef<number | null>(null)
  const refreshRun = useRef(0)
  const manualRefreshActive = useRef(false)

  const refresh = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!authenticated || !email) return
    if (silent && manualRefreshActive.current) return
    const run = ++refreshRun.current
    if (!silent) {
      manualRefreshActive.current = true
      setRefreshing(true)
      setError('')
    }
    try {
      const next = await loadPocketX402Snapshot({ email, network, getAccessToken, force: true })
      if (run !== refreshRun.current) return
      setSnapshot(next)
      const refreshedGatewayBalance = Number(next.gatewayBalance ?? '0')
      const targetBalance = activationTargetBalance.current
      if (targetBalance != null && next.gatewayBalanceChecked && Number.isFinite(refreshedGatewayBalance)) {
        if (refreshedGatewayBalance + 0.0000005 >= targetBalance) {
          setActivationPending(false)
          setActivationSuccess('')
          setActivationOpen(false)
          activationKey.current = ''
          activationTargetBalance.current = null
        } else if (!silent) {
          // Pull-to-refresh removes the large submitted notice while the
          // disabled Updating CTA continues to prevent a duplicate activation.
          setActivationSuccess('')
        }
      }
      if (!next.connected) setWalletMode(next.found ? 'login' : 'create')
      if (next.connected) {
        setWalletStep('done')
        setOtpNetwork(null)
      }
    } catch (reason) {
      if (!silent && run === refreshRun.current) setError(readableError(reason, 'Could not load x402 wallet status.'))
    } finally {
      if (!silent && run === refreshRun.current) {
        manualRefreshActive.current = false
        setSnapshotReady(true)
        setRefreshing(false)
      }
    }
  }, [authenticated, email, getAccessToken, network])

  useEffect(() => {
    if (!authenticated || !email) return
    const refreshInBackground = () => {
      if (document.visibilityState === 'visible') void refresh({ silent: true })
    }
    const timer = window.setInterval(refreshInBackground, 30_000)
    document.addEventListener('visibilitychange', refreshInBackground)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshInBackground)
    }
  }, [authenticated, email, refresh])

  useEffect(() => {
    if (!authenticated || !email) {
      refreshRun.current += 1
      manualRefreshActive.current = false
      setSnapshot(null)
      setSnapshotReady(true)
      setRefreshing(false)
      setWalletMode('create')
      setWalletStep('idle')
      setOtp('')
      setOtpNetwork(null)
      setExpectedWallet('')
      setWalletChoices([])
      setError('')
      setActivationSuccess('')
      setActivationPending(false)
      activationTargetBalance.current = null
      return
    }
    const cached = pocketX402SnapshotCache.get(x402CacheKey(email, network)) ?? null
    setSnapshot(cached)
    setSnapshotReady(Boolean(cached))
    void refresh()
  }, [authenticated, email, network, refresh])

  const selectNetwork = useCallback((next: PocketX402Network) => {
    if (next === network) return
    if (walletStep === 'otp') {
      setError('Finish this OTP login or resend OTP before changing network.')
      return
    }
    setNetworkState(next)
    const cached = pocketX402SnapshotCache.get(x402CacheKey(email, next)) ?? null
    setSnapshot(cached)
    setSnapshotReady(Boolean(cached))
    setActivationOpen(false)
    setActivationSuccess('')
    setActivationPending(false)
    activationKey.current = ''
    activationTargetBalance.current = null
  }, [email, network, walletStep])

  const chooseMode = useCallback((mode: PocketX402WalletMode) => {
    setWalletMode(mode)
    setWalletStep('idle')
    setOtp('')
    setOtpNetwork(null)
    setError('')
  }, [])

  const beginConnection = useCallback(async () => {
    setWalletBusy(true)
    setError('')
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in again to manage this Circle wallet.')
      await connectPocketX402Wallet({
        accessToken,
        action: 'init',
        network,
        ...(expectedWallet ? { expectedWallet } : {}),
      })
      setOtp('')
      setOtpNetwork(network)
      setWalletStep('otp')
    } catch (reason) {
      setError(readableError(reason, 'Circle wallet request failed.'))
    } finally {
      setWalletBusy(false)
    }
  }, [expectedWallet, getAccessToken, network])

  const completeConnection = useCallback(async () => {
    if (!otpNetwork || otpNetwork !== network) {
      setError('This code was requested for another network. Resend OTP and use the newest code.')
      return
    }
    setWalletBusy(true)
    setError('')
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in again to manage this Circle wallet.')
      await connectPocketX402Wallet({
        accessToken,
        action: 'complete',
        network,
        otp,
        ...(expectedWallet ? { expectedWallet } : {}),
      })
      setWalletStep('done')
      setOtp('')
      setOtpNetwork(null)
      setWalletChoices([])
      activationKey.current = ''
      await refresh()
    } catch (reason) {
      if (reason instanceof PocketX402ConnectionError) setWalletChoices(reason.walletChoices)
      setOtp('')
      setError(readableError(reason, 'Circle wallet request failed.'))
    } finally {
      setWalletBusy(false)
    }
  }, [expectedWallet, getAccessToken, network, otp, otpNetwork, refresh])

  const resendOtp = useCallback(async () => {
    setOtp('')
    await beginConnection()
  }, [beginConnection])

  const setAmount = useCallback((value: string) => {
    setAmountState(normalizePocketX402Amount(value))
    setActivationSuccess('')
    activationTargetBalance.current = null
    setActivationPending(false)
  }, [])

  const activationError = useMemo(
    () => pocketX402ActivationError(amount, snapshot?.walletBalance),
    [amount, snapshot?.walletBalance],
  )

  const activate = useCallback(async () => {
    if (activationError || !snapshot?.connected) return
    setActivationBusy(true)
    setError('')
    setActivationSuccess('')
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in again to activate x402.')
      const key = activationKey.current || createPocketIdempotencyKey('x402-activate')
      activationKey.current = key
      const currentGatewayBalance = Number(snapshot.gatewayBalance ?? '0')
      const requestedAmount = Number(amount)
      activationTargetBalance.current = Number.isFinite(currentGatewayBalance) && Number.isFinite(requestedAmount)
        ? currentGatewayBalance + requestedAmount
        : null
      const result = await activatePocketX402Gateway({ accessToken, network, amount, idempotencyKey: key })
      if (result.data?.activationStatus === 'available') {
        setActivationSuccess(`${result.data.amount} USDC is available for app payments.`)
        setActivationPending(false)
        setActivationOpen(false)
        activationKey.current = ''
        activationTargetBalance.current = null
        window.setTimeout(() => setActivationSuccess(''), 5000)
      } else {
        setActivationSuccess('Gateway activation was submitted. Pull down to update the balance.')
        setActivationPending(true)
        setActivationOpen(false)
      }
      await refresh({ silent: true })
    } catch (reason) {
      activationTargetBalance.current = null
      setError(readableError(reason, 'Could not add App Pay funds.'))
    } finally {
      setActivationBusy(false)
    }
  }, [activationError, amount, getAccessToken, network, refresh, snapshot?.connected])

  return {
    network,
    snapshot,
    snapshotReady,
    refreshing,
    walletMode,
    walletStep,
    otp,
    otpNetwork,
    expectedWallet,
    walletChoices,
    walletBusy,
    error,
    amount,
    activationOpen,
    activationBusy,
    activationSuccess,
    activationPending,
    activationError,
    setOtp,
    setExpectedWallet,
    setActivationOpen,
    selectNetwork,
    chooseMode,
    beginConnection,
    completeConnection,
    resendOtp,
    refresh,
    setAmount,
    activate,
  }
}
