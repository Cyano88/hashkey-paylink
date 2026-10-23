import { useCallback, useEffect, useRef, useState } from 'react'
import { executeCircleEvmEmailChallenge, reconcileCircleEvmEmailWithdraw, type CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import usePocketPageVisible from '../hooks/usePocketPageVisible'
import PocketArcTokenPicker from './PocketArcTokenPicker'
import PocketSlideAction from './PocketSlideAction'
import { pocketApiUrl } from '../lib/pocketRoutes'

type Token = { address: string; symbol: string; name: string; decimals: number; balance: string | null; balanceStatus: string; logoURI?: string }
type Quote = { id: string; amount: string; expectedOut: string; minimumOut: string; expiresAt: number; tokenIn: Token; tokenOut: Token; gasUsdc: string; fees: { name: string; amount: string; symbol: string; included: boolean }[] }
type Pending = { quoteToken: string; quote: Quote; challengeId?: string; txHash?: string; walletAddress: string }
type Props = { enabled?: boolean; onBusyChange?(busy: boolean): void; email: string; getAccessToken(): Promise<string | null>; ensureWallet(): Promise<{ address: string } | null>; getSession(address: string): Promise<CircleEvmEmailSession>; refresh(): Promise<unknown> }

export default function PocketArcSwapPanel(props: Props) {
  const visible = usePocketPageVisible()
  const [approvalBusy, setApprovalBusy] = useState(false)
  const [tokens, setTokens] = useState<Token[]>([])
  const [tokenIn, setTokenIn] = useState('0x3600000000000000000000000000000000000000')
  const [tokenOut, setTokenOut] = useState('')
  const [amount, setAmount] = useState('')
  const [quoted, setQuoted] = useState<{ quote: Quote; quoteToken: string; sufficientBalance?: boolean | null } | null>(null)
  const [status, setStatus] = useState<'idle' | 'quoting' | 'pending' | 'submitted' | 'successful'>('idle')
  const [catalogError, setCatalogError] = useState('')
  const [loadingTokens, setLoadingTokens] = useState(true)
  const [quoteRefresh, setQuoteRefresh] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [now, setNow] = useState(Date.now())
  const storageKey = 'pocket:arc-mainnet:swap:' + props.email
  const [pending, setPending] = useState<Pending | null>(() => { try { return JSON.parse(sessionStorage.getItem(storageKey) || 'null') } catch { return null } })
  const busy = status === 'pending' || status === 'submitted'
  useEffect(() => { props.onBusyChange?.(busy || approvalBusy); return () => props.onBusyChange?.(false) }, [busy, approvalBusy, props.onBusyChange])
  const requestVersion = useRef(0)
  const locked = useRef(false)
  const session = useRef<CircleEvmEmailSession | null>(null)
  const api = useCallback(async (body?: Record<string, unknown>, tokenAddress?: string) => {
    const accessToken = await props.getAccessToken()
    if (!accessToken) throw new Error('Sign in again to use Arc swaps.')
    const response = await fetch(pocketApiUrl('/api/pocket/arc-swap' + (tokenAddress ? '?token=' + encodeURIComponent(tokenAddress) : '')), {
      method: body ? 'POST' : 'GET',
      headers: { authorization: 'Bearer ' + accessToken, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (response.status === 404) throw new Error('Arc swaps are not available yet. Please try again shortly.')
    const data = await response.json()
    if (!response.ok || !data.ok) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || 'Arc swap request failed.')
    return data
  }, [props.getAccessToken])
  const load = useCallback(async () => {
    setLoadingTokens(true); setCatalogError('')
    try { const data = await api(); setTokens(data.tokens); if (data.pending) savePending(data.pending) }
    catch (reason) { setCatalogError((reason as Error).message) }
    finally { setLoadingTokens(false) }
  }, [api])
  useEffect(() => { if (props.enabled !== false) void load() }, [load, props.enabled])
  useEffect(() => { if (!visible) return; setNow(Date.now()); const id = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [visible])
  function savePending(value: Pending | null) {
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value))
    else sessionStorage.removeItem(storageKey)
    setPending(value)
  }
  function invalidate() { requestVersion.current++; setQuoted(null); setStatus('idle'); setError(''); setNotice('') }
  async function prepare() {
    try {
      const wallet = await props.ensureWallet()
      if (!wallet) throw new Error('Open your Arc wallet to continue.')
      session.current = await props.getSession(wallet.address)
      if (session.current.wallet.blockchain !== 'ARC') throw new Error('Reconnect your Arc mainnet wallet.')
    } catch (reason) { setError((reason as Error).message); throw reason }
  }
  async function getQuote() {
    if (locked.current || pending || document.visibilityState !== 'visible') return
    const version = ++requestVersion.current
    setStatus('quoting'); setError(''); setQuoted(null)
    try {
      const data = await api({ action: 'quote', tokenIn, tokenOut, amount })
      if (version !== requestVersion.current) return
      setQuoted({ quote: data.quote, quoteToken: data.quoteToken, sufficientBalance: data.sufficientBalance })
      if (data.balanceStatus) setTokens(current => current.map(token => token.address.toLowerCase() === data.quote.tokenIn.address.toLowerCase() ? { ...token, balance: data.balance, balanceStatus: data.balanceStatus } : token))
      setStatus('idle')
    } catch (reason) {
      if (version !== requestVersion.current) return
      setError((reason as Error).message); setStatus('idle')
    }
  }
  const quoteRequest = useRef(getQuote); quoteRequest.current = getQuote
  const selectedInput = tokens.find(token => token.address.toLowerCase() === tokenIn.toLowerCase())
  const selectedOutput = tokens.find(token => token.address.toLowerCase() === tokenOut.toLowerCase())
  const amountValid = !!selectedInput && /^\d+(?:\.\d+)?$/.test(amount) && amount.length <= 70 && /[1-9]/.test(amount) && (amount.split('.')[1]?.length ?? 0) <= selectedInput.decimals
  const pairReady = !!selectedInput && !!selectedOutput && tokenIn.toLowerCase() !== tokenOut.toLowerCase()
  useEffect(() => {
    if (pending || busy || approvalBusy) return
    requestVersion.current++; setQuoted(null)
    if (!visible || props.enabled === false || !pairReady || !amountValid || catalogError) return
    setStatus('quoting')
    const timer = window.setTimeout(() => void quoteRequest.current(), 500)
    return () => { window.clearTimeout(timer); requestVersion.current++ }
  }, [tokenIn, tokenOut, amount, pairReady, amountValid, pending, busy, approvalBusy, catalogError, props.enabled, quoteRefresh, visible])
  useEffect(() => {
    if (!visible || !quoted || props.enabled === false || busy || approvalBusy || pending) return
    const timer = window.setTimeout(() => setQuoteRefresh(value => value + 1), Math.max(1000, quoted.quote.expiresAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [quoted, props.enabled, busy, approvalBusy, pending, visible])
  async function discover(address: string): Promise<Token> { const data = await api(undefined, address); return data.token }
  function choose(token: Token, side: 'in' | 'out') {
    invalidate(); setTokens(current => current.some(item => item.address.toLowerCase() === token.address.toLowerCase()) ? current : [...current, token])
    if (side === 'in') setTokenIn(token.address); else setTokenOut(token.address)
  }
  async function check(value: Pending) {
    let next = value
    const active = session.current ?? await props.getSession(next.walletAddress)
    const server = await api({ action: 'status', quoteToken: next.quoteToken, txHash: next.txHash, circleUserToken: active.userToken })
    if (server.status === 'failed' || server.status === 'not_submitted') { savePending(null); setQuoted(null); setStatus('idle'); setNotice(server.error || 'No swap was submitted. Request a new quote.'); return }
    if (server.status === 'completed') { savePending(null); setQuoted(null); setStatus('successful'); setNotice('Received ' + server.amountOut + ' ' + next.quote.tokenOut.symbol + ' on Arc.'); await Promise.all([load(), props.refresh()]); return }
    if (!next.txHash) {
      if (!next.challengeId) {
        const recovery = await api({ action: 'status', quoteToken: next.quoteToken })
        if (recovery.status === 'not_submitted') { savePending(null); setQuoted(null); setStatus('idle'); setNotice('No swap was submitted. You can request a new quote.'); return }
        if (!recovery.challengeId) { setNotice('Checking the submitted request. Do not create a second swap.'); setStatus('idle'); return }
        next = { ...next, challengeId: recovery.challengeId }; savePending(next)
      }
      const active = session.current ?? await props.getSession(next.walletAddress)
      const result = await reconcileCircleEvmEmailWithdraw({ session: active, challengeId: next.challengeId!, timeoutMs: 15_000 })
      if (!result.txHash) { setNotice('Waiting for wallet confirmation. Check status again shortly.'); setStatus('idle'); return }
      next = { ...next, txHash: result.txHash }; savePending(next)
    }
    const result = await api({ action: 'status', quoteToken: next.quoteToken, txHash: next.txHash })
    if (result.status === 'completed') {
      setNotice('Received ' + result.amountOut + ' ' + next.quote.tokenOut.symbol + ' on Arc.')
      savePending(null); setQuoted(null); setStatus('successful')
      await Promise.all([load(), props.refresh()])
    } else if (result.status === 'failed') {
      savePending(null); setStatus('idle'); setError(result.error)
    } else { setNotice(result.error || 'Swap submitted. Waiting for onchain confirmation.'); setStatus('idle') }
  }
  async function execute() {
    if (locked.current || !quoted || quoted.sufficientBalance !== true || quoted.quote.expiresAt <= Date.now()) return
    locked.current = true; setStatus('pending'); setError('')
    let activePending: Pending | null = pending
    try {
      if (!session.current) throw new Error('Unlock your Arc wallet before swapping.')
      activePending = pending ?? { ...quoted, walletAddress: session.current.wallet.address }
      savePending(activePending)
      const challenge = await api({ action: 'execute', quoteToken: quoted.quoteToken, circleUserToken: session.current.userToken })
      if (!challenge.challengeId) throw new Error('Circle did not return a swap challenge.')
      activePending = { ...activePending, challengeId: challenge.challengeId }; savePending(activePending)
      setStatus('submitted')
      const result = await executeCircleEvmEmailChallenge({ session: session.current, challengeId: challenge.challengeId, pendingMessage: 'Check swap status before submitting another swap.' })
      if (result.transactionHash) { activePending = { ...activePending, txHash: result.transactionHash }; savePending(activePending) }
      await check(activePending)
    } catch (reason) {
      setError((reason as Error).message)
      setStatus('idle')
    } finally { locked.current = false }
  }
  const selected = tokens.find(token => token.address.toLowerCase() === tokenIn.toLowerCase())
  return <section className="space-y-5 rounded-[26px] border border-gray-100 bg-white p-5 shadow-sm dark:border-[#262626] dark:bg-[#121212] dark:shadow-none">
    <p className="text-xs text-gray-500">Exchange tokens in your Arc wallet.</p>
    {pending ? <div className="space-y-3 rounded-2xl bg-blue-50 p-4 dark:bg-blue-500/10">
      <p className="text-sm">Your swap is awaiting confirmation. Check its status before creating another.</p>
      <button type="button" disabled={busy} onClick={() => { setError(''); void prepare().then(() => check(pending)).catch(reason => setError(reason.message)) }} className="text-sm font-bold text-blue-600">Check swap status</button>
      {pending.txHash && <a className="block text-xs text-blue-600" href={'https://explorer.arc.io/tx/' + pending.txHash} target="_blank" rel="noreferrer">View transaction</a>}
    </div> : <>
      <div className="grid grid-cols-2 gap-3">
        <div><p className="mb-2 text-xs text-gray-500">From</p><PocketArcTokenPicker label="Input Arc token" value={tokenIn} tokens={tokens} excluded={tokenOut} disabled={loadingTokens || !!catalogError || busy || approvalBusy} discover={discover} onChange={token => choose(token, 'in')} /></div>
        <div><p className="mb-2 text-xs text-gray-500">To</p><PocketArcTokenPicker label="Output Arc token" value={tokenOut} tokens={tokens} excluded={tokenIn} disabled={loadingTokens || !!catalogError || busy || approvalBusy} discover={discover} onChange={token => choose(token, 'out')} /></div>
      </div>
      {loadingTokens && <p role="status" className="text-xs text-gray-400">Loading Arc tokens...</p>}
      {catalogError && <p role="alert" className="text-xs text-gray-500">{catalogError} <button type="button" onClick={() => void load()} className="font-bold text-blue-600">Try again</button></p>}
      <label className="block text-xs text-gray-500">Amount<input aria-label="Swap amount" inputMode="decimal" disabled={busy || approvalBusy || !!catalogError} value={amount} onChange={event => { invalidate(); setAmount(event.target.value) }} className="mt-2 w-full rounded-2xl border border-gray-200 bg-transparent p-4 text-base text-gray-950 dark:border-[#262626] dark:text-white" placeholder="0.00" /></label>
      <p className="text-xs text-gray-500">Available: {selected?.balance ?? '—'} {selected?.symbol}</p>
      {selected?.balanceStatus === 'wallet_required' && <button type="button" onClick={() => void props.ensureWallet().then(() => load()).catch(reason => setError(reason.message))} className="text-xs font-bold text-blue-600">Open Arc wallet</button>}
      {quoted && <div className="space-y-2 rounded-2xl bg-gray-50 p-4 text-xs dark:bg-[#171717]">
        <p>Estimated receive: <b>{quoted.quote.expectedOut} {quoted.quote.tokenOut.symbol}</b></p>
        <p>Minimum receive: <b>{quoted.quote.minimumOut} {quoted.quote.tokenOut.symbol}</b></p>
        <p>Slippage limit: 0.5%</p>
        {quoted.quote.fees.map((fee, index) => <p key={index}>{fee.name}: {fee.amount} {fee.symbol}{fee.included ? ' (included)' : ''}</p>)}
        <p>Estimated network gas: {quoted.quote.gasUsdc} USDC · sponsorship applies if available</p>
        <p>{quoted.quote.expiresAt > now ? 'Quote valid for ' + Math.ceil((quoted.quote.expiresAt - now) / 1000) + ' seconds' : 'Refreshing price...'}</p>
      </div>}
      {error && !quoted && pairReady && amountValid && <button type="button" onClick={() => setQuoteRefresh(value => value + 1)} className="text-xs font-bold text-blue-600">Try price again</button>}
      <PocketSlideAction approvalRequired={false} onApprovalBusyChange={setApprovalBusy} status={status === 'successful' ? 'successful' : busy ? status : 'idle'} disabled={!quoted || quoted.sufficientBalance !== true || quoted.quote.expiresAt <= now || status === 'quoting'} onPrepare={prepare} onConfirm={() => void execute()} labels={{ idle: 'Confirm swap', disabled: catalogError ? 'Swaps unavailable' : !pairReady ? 'Select tokens' : !amountValid ? 'Enter amount' : status === 'quoting' ? 'Updating price...' : quoted?.sufficientBalance === false ? 'Insufficient balance' : quoted && quoted.sufficientBalance !== true ? 'Balance unavailable' : 'Price unavailable', pending: 'Preparing swap', submitted: 'Confirming swap', successful: 'Swapped' }} />
    </>}
    {notice && <p className="text-xs text-emerald-600">{notice}</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700 dark:bg-red-400/10 dark:text-red-200">{error}</p>}
  </section>
}
