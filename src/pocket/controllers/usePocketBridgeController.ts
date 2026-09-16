import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bridgeCircleEvmEmailWallet, type CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import { readPocketBridgeQuote, recordPocketBridge, type PocketBridgeNetwork, type PocketBridgeQuote } from '../api/pocketBridgeClient'
import { bridgeCircleSolanaWallet } from '../lib/pocketSolanaBridge'
import { ambiguousMatchingBridge, readPocketBridgeTransfers, savePocketBridgeTransfer, type PocketPendingBridge } from '../lib/pocketPendingBridge'
import type { PocketSolanaEmailSession } from './usePocketWalletController'
import type { CirclePocketWallet } from '../models/pocketWallet'
import { registerPocketPaymentPreparer } from '../lib/pocketPaymentApproval'

export type PocketBridgeStatus = 'idle' | 'quoting' | 'confirming'
export default function usePocketBridgeController(input: {
  owner: string
  source: PocketBridgeNetwork
  sourceBalance: number
  wallets: Partial<Record<PocketBridgeNetwork, CirclePocketWallet>>
  ensureWallet(network: PocketBridgeNetwork): Promise<CirclePocketWallet | null>
  getEvmSession(network: 'base' | 'arbitrum' | 'arc', walletAddress: string): Promise<CircleEvmEmailSession>
  getSolanaSession(walletAddress: string): Promise<PocketSolanaEmailSession>
  getAccessToken(): Promise<string | null>
  refresh(): Promise<unknown>
  onActivity(): void
}) {
  const latest = useRef(input)
  latest.current = input
  const destinations = useMemo(() => (['base', 'arbitrum', 'arc', 'solana'] as PocketBridgeNetwork[]).filter(network => network !== input.source), [input.source])
  const [destination, setDestinationState] = useState<PocketBridgeNetwork>(destinations[0])
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState<PocketBridgeQuote | null>(null)
  const [status, setStatus] = useState<PocketBridgeStatus>('idle')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const locked = useRef(false)
  const quoteVersion = useRef(0)
  const invalidate = () => { quoteVersion.current++; setQuote(null); setStatus('idle'); setError(''); setNotice('') }
  const updateAmount = (value: string) => { if (locked.current) return; invalidate(); setAmount(value) }
  const setDestination = (network: PocketBridgeNetwork) => { if (locked.current) return; invalidate(); setDestinationState(network) }
  useEffect(() => {
    quoteVersion.current++; setQuote(null)
    if (locked.current) return
    setDestinationState(current => destinations.includes(current) ? current : destinations[0])
    setAmount(''); setStatus('idle'); setError(''); setNotice('')
  }, [input.source])
  const assertNewTransfer = useCallback(() => {
    const match = ambiguousMatchingBridge(readPocketBridgeTransfers(input.owner, localStorage), input.source, destination, amount)
    if (match) throw new Error('An earlier bridge for this amount and route has an unknown result. Check it in Activity before repeating it.')
  }, [input.owner, input.source, destination, amount])
  const refreshQuote = useCallback(async () => {
    const version = ++quoteVersion.current
    if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || input.source === destination) { setQuote(null); return null }
    setStatus('quoting'); setError('')
    try {
      const accessToken = await input.getAccessToken()
      if (!accessToken) throw new Error('Sign in again to quote this bridge.')
      const next = await readPocketBridgeQuote({ accessToken, source: input.source, destination, amount })
      if (version !== quoteVersion.current) return null
      setQuote(next); setStatus('idle'); return next
    } catch (reason) {
      if (version === quoteVersion.current) { setQuote(null); setStatus('idle'); setError(reason instanceof Error ? reason.message : 'Could not quote this bridge route.') }
      return null
    }
  }, [amount, destination, input.getAccessToken, input.source])
  useEffect(() => {
    if (locked.current) return
    const timer = window.setTimeout(() => void refreshQuote(), 450)
    return () => clearTimeout(timer)
  }, [refreshQuote])
  const prepare = useCallback(async () => {
    try {
      assertNewTransfer()
      if (!quote) throw new Error('Get a current quote before confirming.')
      const sourceWallet = input.wallets[input.source] ?? await input.ensureWallet(input.source)
      if (!sourceWallet) throw new Error('Open the source Pocket wallet before confirming.')
      if (input.source === 'solana') await input.getSolanaSession(sourceWallet.address)
      else await input.getEvmSession(input.source, sourceWallet.address)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not prepare this bridge.'); throw reason }
  }, [input, quote, assertNewTransfer])
  useEffect(() => registerPocketPaymentPreparer(prepare), [prepare])
  const bridge = useCallback(async () => {
    if (locked.current) return
    locked.current = true; setSubmitting(true)
    const owner = input.owner
    let saved = false
    setError(''); setNotice('')
    try {
      assertNewTransfer()
      const fresh = await refreshQuote()
      if (!fresh) return
      if (Number(fresh.total) > input.sourceBalance) throw new Error('Amount plus network fee is higher than your available balance.')
      const sourceWallet = input.wallets[input.source] ?? await input.ensureWallet(input.source)
      const destinationWallet = input.wallets[destination] ?? await input.ensureWallet(destination)
      if (!sourceWallet || !destinationWallet) throw new Error('Open both Pocket wallets before bridging.')
      const accessToken = await input.getAccessToken()
      if (!accessToken) throw new Error('Sign in again to bridge USDC.')
      const session = input.source === 'solana' ? await input.getSolanaSession(sourceWallet.address) : await input.getEvmSession(input.source, sourceWallet.address)
      if (latest.current.owner !== owner) return
      let active: PocketPendingBridge = { id: crypto.randomUUID(), source: input.source, destination, amount, walletAddress: sourceWallet.address, createdAt: Date.now(), progress: 'needs_attention' }
      const persist = () => { savePocketBridgeTransfer(owner, active, localStorage); saved = true }
      setStatus('confirming')
      const txHash = input.source === 'solana'
        ? await bridgeCircleSolanaWallet({ session: session as PocketSolanaEmailSession, destination: destination as Exclude<PocketBridgeNetwork, 'solana'>, destinationAddress: destinationWallet.address, amount, accessToken, onBeforeSubmit: persist })
        : await bridgeCircleEvmEmailWallet({ privyAccessToken: accessToken, idempotencyKey: active.id, session: session as CircleEvmEmailSession, destination, destinationAddress: destinationWallet.address, amount, onChallenge: challengeId => { active = { ...active, challengeId }; persist() } })
      active = { ...active, txHash, progress: 'submitted' }
      persist()
      // Track this transfer independently. A new form must never resume or
      // rebroadcast the submitted attempt, even when the user enters it again.
      void recordPocketBridge({ accessToken, ...active, txHash, status: 'submitted' }).then(() => { if (latest.current.owner === owner) input.onActivity() }).catch(() => undefined)
      if (latest.current.owner !== owner) return
      quoteVersion.current++; setQuote(null); setAmount(''); setStatus('idle')
      setNotice('Bridge submitted. Follow its progress in Activity.')
      void input.refresh().catch(() => undefined)
      input.onActivity()
    } catch (reason) {
      if (latest.current.owner !== owner) return
      setStatus('idle')
      setError(reason instanceof Error ? reason.message : 'Could not complete this bridge.')
      if (saved) {
        quoteVersion.current++; setQuote(null); setAmount('')
        setNotice('Check this transfer in Activity before repeating it.')
        input.onActivity()
      }
    } finally { locked.current = false; setSubmitting(false) }
  }, [amount, destination, input, assertNewTransfer, refreshQuote])
  return { destinations, destination, setDestination, amount, setAmount: updateAmount, quote, status, error, notice, refreshQuote, bridge, submitting }
}
