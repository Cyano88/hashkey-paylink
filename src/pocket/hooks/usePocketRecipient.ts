import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { formatAmount, truncateAddress } from '../../lib/utils'
import { readPocketRecipientBalance } from '../api/pocketReadClient'
import { readPocketWallet, unlinkPocketWallet } from '../api/pocketWalletLinkClient'
import usePocketWalletController from '../controllers/usePocketWalletController'
import type { PocketNetwork } from '../lib/pocketSchemas'

type ReceiveMode = 'paste' | 'email' | 'bank'
type PocketAccessTokenReader = () => Promise<string | null>

const EMAIL_RECEIVE_INTENT_KEY = 'hashpaylink-circle-email-receive-intent'

export default function usePocketRecipient({
  authenticated,
  email,
  getAccessToken,
  network,
  receiveMode,
  setReceiveMode,
  evmAddress,
  solanaAddress,
  evmValid,
  solanaValid,
  canReceiveWithEmail,
  setEvmAddress,
  setSolanaAddress,
  invalidateResult,
}: {
  authenticated: boolean
  email: string
  getAccessToken: PocketAccessTokenReader
  network: PocketNetwork
  receiveMode: ReceiveMode
  setReceiveMode: Dispatch<SetStateAction<ReceiveMode>>
  evmAddress: string
  solanaAddress: string
  evmValid: boolean
  solanaValid: boolean
  canReceiveWithEmail: boolean
  setEvmAddress: (address: string) => void
  setSolanaAddress: (address: string) => void
  invalidateResult: () => void
}) {
  const { ensureWallet } = usePocketWalletController({ authenticated, email, getAccessToken })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [walletBalance, setWalletBalance] = useState('Balance --')
  const runKey = useRef('')

  const connect = useCallback(async () => {
    if (!canReceiveWithEmail) {
      setReceiveMode('email')
      invalidateResult()
      setError('Circle Pocket receiving is not configured for this network. Paste a wallet address instead.')
      return
    }
    if (!authenticated) {
      setError('Sign in with Privy first, then continue receiving with email.')
      return
    }
    setReceiveMode('email')
    invalidateResult()
    setError(null)
    if (!email) {
      setError('Sign in with email to receive with Circle Pocket for this network.')
      return
    }

    const currentRun = `${network}:${email}`
    runKey.current = currentRun
    setPending(true)
    try {
      const wallet = await ensureWallet(network, { shouldContinue: () => runKey.current === currentRun })
      if (!wallet) return
      if (network === 'solana') setSolanaAddress(wallet.address)
      else setEvmAddress(wallet.address)
      setError(null)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Circle smart wallet setup failed.'
      setError(message === 'Payment cancelled.' ? 'Payment request cancelled.' : message)
    } finally {
      if (runKey.current === currentRun) setPending(false)
    }
  }, [authenticated, canReceiveWithEmail, email, ensureWallet, invalidateResult, network, setEvmAddress, setReceiveMode, setSolanaAddress])

  const disconnect = useCallback(async () => {
    setError(null)
    invalidateResult()
    try {
      const accessToken = await getAccessToken()
      if (accessToken) {
        const existing = await readPocketWallet({ accessToken, network })
        await unlinkPocketWallet({
          accessToken,
          network,
          expectedUpdatedAt: existing?.updatedAt,
        })
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not disconnect Circle wallet.')
    } finally {
      setReceiveMode('paste')
      if (network === 'solana') setSolanaAddress('')
      else setEvmAddress('')
    }
  }, [getAccessToken, invalidateResult, network, setEvmAddress, setReceiveMode, setSolanaAddress])

  const selectPaste = useCallback(() => {
    setReceiveMode('paste')
    setError(null)
    invalidateResult()
  }, [invalidateResult, setReceiveMode])

  const deferEmailSignIn = useCallback(() => {
    setReceiveMode('email')
    invalidateResult()
    setError(null)
  }, [invalidateResult, setReceiveMode])

  const rememberSignInIntent = useCallback(() => {
    try { window.sessionStorage.setItem(EMAIL_RECEIVE_INTENT_KEY, network) } catch {}
  }, [network])

  useEffect(() => {
    if (!authenticated || !email) return
    let intent = ''
    try { intent = window.sessionStorage.getItem(EMAIL_RECEIVE_INTENT_KEY) || '' } catch {}
    if (!intent) return
    try { window.sessionStorage.removeItem(EMAIL_RECEIVE_INTENT_KEY) } catch {}
    if (!canReceiveWithEmail) return
    setReceiveMode('email')
    invalidateResult()
    setError(null)
  }, [authenticated, canReceiveWithEmail, email, invalidateResult, setReceiveMode])

  useEffect(() => {
    if (receiveMode !== 'email' || !authenticated || !email || pending) return
    if (network === 'solana' ? solanaValid : evmValid) return
    void connect()
  }, [authenticated, email, network, receiveMode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (receiveMode === 'bank' || canReceiveWithEmail) return
    setReceiveMode('paste')
    setError(null)
  }, [canReceiveWithEmail, receiveMode, setReceiveMode])

  const walletReady = network === 'solana' ? solanaValid : evmValid
  useEffect(() => {
    if (receiveMode !== 'email' || !walletReady) {
      setWalletBalance('Balance --')
      return
    }
    let cancelled = false
    setWalletBalance('Balance ...')
    void readPocketRecipientBalance({
      network,
      address: network === 'solana' ? solanaAddress : evmAddress,
    }).then(balance => {
      if (!cancelled) setWalletBalance(`Balance ${formatAmount(balance.toString(), 6)} USDC`)
    }).catch(() => {
      if (!cancelled) setWalletBalance('Balance --')
    })
    return () => { cancelled = true }
  }, [evmAddress, network, receiveMode, solanaAddress, walletReady])

  const recipientAddressLabel = pending
    ? 'Preparing wallet...'
    : network === 'solana' && solanaValid
      ? truncateAddress(solanaAddress, 8)
      : evmValid
        ? truncateAddress(evmAddress, 8)
        : email || 'Sign in to open Circle Pocket'

  return {
    pending,
    error,
    walletBalance,
    walletReady,
    recipientAddressLabel,
    connect,
    disconnect,
    selectPaste,
    deferEmailSignIn,
    rememberSignInIntent,
  }
}
