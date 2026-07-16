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
type PocketX402WalletMode = 'choose' | 'create' | 'login'
type PocketX402WalletStep = 'idle' | 'otp' | 'done'

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
  const [snapshot, setSnapshot] = useState<PocketX402SnapshotData | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [walletMode, setWalletMode] = useState<PocketX402WalletMode>('choose')
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
  const refreshRun = useRef(0)

  const refresh = useCallback(async () => {
    if (!authenticated || !email) return
    const run = ++refreshRun.current
    setRefreshing(true)
    setError('')
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in again to view x402 balances.')
      const next = await readPocketX402Snapshot({ accessToken, network })
      if (run !== refreshRun.current) return
      setSnapshot(next)
      if (next.found && !next.connected) setWalletMode('login')
      if (next.connected) {
        setWalletStep('done')
        setOtpNetwork(null)
      }
    } catch (reason) {
      if (run === refreshRun.current) setError(readableError(reason, 'Could not load x402 wallet status.'))
    } finally {
      if (run === refreshRun.current) setRefreshing(false)
    }
  }, [authenticated, email, getAccessToken, network])

  useEffect(() => {
    if (!authenticated || !email) {
      refreshRun.current += 1
      setSnapshot(null)
      setRefreshing(false)
      setWalletMode('choose')
      setWalletStep('idle')
      setOtp('')
      setOtpNetwork(null)
      setExpectedWallet('')
      setWalletChoices([])
      setError('')
      return
    }
    void refresh()
  }, [authenticated, email, refresh])

  const selectNetwork = useCallback((next: PocketX402Network) => {
    if (next === network) return
    if (walletStep === 'otp') {
      setError('Finish this OTP login or resend OTP before changing network.')
      return
    }
    setNetworkState(next)
    setSnapshot(null)
    setActivationOpen(false)
    setActivationSuccess('')
    setActivationPending(false)
    activationKey.current = ''
  }, [network, walletStep])

  const chooseMode = useCallback((mode: Exclude<PocketX402WalletMode, 'choose'>) => {
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
      const result = await activatePocketX402Gateway({ accessToken, network, amount, idempotencyKey: key })
      if (result.data?.activationStatus === 'available') {
        setActivationSuccess(`${result.data.amount} USDC moved into x402 service balance.`)
        setActivationPending(false)
        setActivationOpen(false)
        activationKey.current = ''
        window.setTimeout(() => setActivationSuccess(''), 5000)
      } else {
        setActivationSuccess('Gateway activation was submitted. Refresh the balance before starting another activation.')
        setActivationPending(true)
        setActivationOpen(false)
      }
      await refresh()
    } catch (reason) {
      setError(readableError(reason, 'x402 activation failed.'))
    } finally {
      setActivationBusy(false)
    }
  }, [activationError, amount, getAccessToken, network, refresh, snapshot?.connected])

  return {
    network,
    snapshot,
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
