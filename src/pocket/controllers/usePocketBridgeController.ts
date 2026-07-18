import { useCallback, useEffect, useMemo, useState } from 'react'
import { bridgeCircleEvmEmailWallet, type CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import { readPocketBridgeQuote, readPocketBridgeStatus, recordPocketBridge, type PocketBridgeNetwork, type PocketBridgeQuote } from '../api/pocketBridgeClient'
import { bridgeCircleSolanaWallet } from '../lib/pocketSolanaBridge'
import type { PocketSolanaEmailSession } from './usePocketWalletController'
import type { CirclePocketWallet } from '../models/pocketWallet'
import { formatPocketDisplayAmount } from '../lib/pocketMoney'

export type PocketBridgeStatus = 'idle' | 'quoting' | 'confirming' | 'bridging' | 'successful'

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))
const bridgeNetworkLabel = (network: PocketBridgeNetwork) => network === 'solana' ? 'Solana' : network === 'base' ? 'Base' : 'Arbitrum'

export default function usePocketBridgeController(input: {
  source: PocketBridgeNetwork
  sourceBalance: number
  wallets: Partial<Record<PocketBridgeNetwork, CirclePocketWallet>>
  ensureWallet(network: PocketBridgeNetwork): Promise<CirclePocketWallet | null>
  getEvmSession(network: 'base' | 'arbitrum', walletAddress: string): Promise<CircleEvmEmailSession>
  getSolanaSession(walletAddress: string): Promise<PocketSolanaEmailSession>
  getAccessToken(): Promise<string | null>
  refresh(): Promise<unknown>
  onActivity(): void
}) {
  const destinations = useMemo(() => (['base', 'arbitrum', 'solana'] as PocketBridgeNetwork[]).filter(network => network !== input.source), [input.source])
  const [destination, setDestinationState] = useState<PocketBridgeNetwork>(destinations[0])
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState<PocketBridgeQuote | null>(null)
  const [status, setStatus] = useState<PocketBridgeStatus>('idle')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const updateAmount = useCallback((value: string) => {
    setAmount(value)
    if (status === 'successful') {
      setStatus('idle')
      setNotice('')
      setError('')
    }
  }, [status])

  useEffect(() => {
    if (!destinations.includes(destination)) setDestinationState(destinations[0])
    setAmount('')
    setQuote(null)
    setStatus('idle')
    setError('')
    setNotice('')
  }, [input.source])

  const setDestination = useCallback((network: PocketBridgeNetwork) => {
    setDestinationState(network)
    setQuote(null)
    setStatus('idle')
    setError('')
    setNotice('')
  }, [])

  const refreshQuote = useCallback(async () => {
    const numeric = Number(amount)
    if (!amount || !Number.isFinite(numeric) || numeric <= 0 || input.source === destination) {
      setQuote(null)
      return null
    }
    setStatus('quoting')
    setError('')
    try {
      const accessToken = await input.getAccessToken()
      if (!accessToken) throw new Error('Sign in again to quote this bridge.')
      const next = await readPocketBridgeQuote({ accessToken, source: input.source, destination, amount })
      setQuote(next)
      setStatus('idle')
      return next
    } catch (reason) {
      setQuote(null)
      setStatus('idle')
      setError(reason instanceof Error ? reason.message : 'Could not quote this bridge route.')
      return null
    }
  }, [amount, destination, input.getAccessToken, input.source])

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshQuote(), 450)
    return () => window.clearTimeout(timer)
  }, [refreshQuote])

  const bridge = useCallback(async () => {
    setError('')
    setNotice('')
    try {
      const fresh = await refreshQuote()
      if (!fresh) return
      if (Number(fresh.total) > input.sourceBalance) throw new Error('Amount plus Circle network fee is higher than your available balance.')
      const [sourceWallet, destinationWallet] = await Promise.all([
        input.wallets[input.source] ?? input.ensureWallet(input.source),
        input.wallets[destination] ?? input.ensureWallet(destination),
      ])
      if (!sourceWallet || !destinationWallet) throw new Error('Open both Pocket wallets to bridge USDC.')
      setStatus('confirming')
      const txHash = input.source === 'solana'
        ? await bridgeCircleSolanaWallet({ session: await input.getSolanaSession(sourceWallet.address), destination: destination as 'base' | 'arbitrum', destinationAddress: destinationWallet.address, amount })
        : await bridgeCircleEvmEmailWallet({ session: await input.getEvmSession(input.source, sourceWallet.address), destination, destinationAddress: destinationWallet.address, amount })
      setStatus('successful')
      setNotice(`${formatPocketDisplayAmount(amount)} USDC sent from ${bridgeNetworkLabel(input.source)} · Arriving on ${bridgeNetworkLabel(destination)}`)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8)
      setAmount('')
      setQuote(null)
      void input.refresh().catch(() => undefined)
      void (async () => {
        const accessToken = await input.getAccessToken()
        if (!accessToken) return
        const recorded = await recordPocketBridge({ accessToken, source: input.source, destination, amount, txHash, status: 'submitted' })
          .then(() => true)
          .catch(() => false)
        if (!recorded) return
        input.onActivity()
        let complete = false
        for (let attempt = 0; attempt < 36 && !complete; attempt += 1) {
          if (attempt) await wait(5_000)
          const next = await readPocketBridgeStatus({ accessToken, source: input.source, txHash }).catch(() => null)
          complete = next?.status === 'confirmed' || next?.status === 'complete'
        }
        if (complete) await recordPocketBridge({ accessToken, source: input.source, destination, amount, txHash, status: 'completed' }).catch(() => undefined)
      })()
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Bridge failed.'
      if (message.includes('submitted and is being reconciled')) {
        setStatus('bridging')
        setNotice(message)
        setError('')
        await input.refresh().catch(() => undefined)
        input.onActivity()
        return
      }
      setStatus('idle')
      setError(message)
    }
  }, [amount, destination, input, refreshQuote])

  return { destinations, destination, setDestination, amount, setAmount: updateAmount, quote, status, error, notice, refreshQuote, bridge }
}
