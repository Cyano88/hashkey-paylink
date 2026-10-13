import { useCallback, useEffect, useRef, useState } from 'react'
import PocketBottomSheet from './PocketBottomSheet'
import PocketSlideAction from './PocketSlideAction'
import PocketTransactionSheet from './PocketTransactionSheet'
import { PocketSkeletonBar } from './PocketContentSkeletons'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketWallets from '../hooks/usePocketWallets'
import usePocketWalletController from '../controllers/usePocketWalletController'
import { executePocketEvmTransfer } from '../api/pocketEvmTransferClient'
import { pocketEsimRequest } from '../api/pocketEsimClient'
import type { PocketEsimOrder, PocketEsimPlan } from '../lib/pocketEsim'
import { markPocketActivityDirty } from '../lib/pocketActivityCache'
import { pocketEsimStatus } from '../lib/pocketEsimStatus'
import { readCirclePaymentFeeQuote } from '../../lib/circleEvmEmailWallet'

export default function PocketEsimCheckout({ plan, days, existing, onClose }: { plan?: PocketEsimPlan; days?: number; existing?: PocketEsimOrder; onClose(): void }) {
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const wallets = usePocketWallets({ authenticated, email, getAccessToken })
  const onWalletReady = useCallback((network: any, wallet: any) => wallets.setWallets(current => ({ ...current, [network]: wallet })), [wallets.setWallets])
  const wallet = usePocketWalletController({ authenticated, email, getAccessToken, onWalletReady })
  const [asset, setAsset] = useState<'USDC' | 'USDT'>(existing?.asset || 'USDC')
  const [intent, setIntent] = useState<PocketEsimOrder | null>(existing || null)
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(!existing), [error, setError] = useState('')
  const [attempted, setAttempted] = useState(Boolean(existing && existing.state !== 'quoted'))
  const [retry, setRetry] = useState(0)
  const alive = useRef(true), inFlight = useRef(false), latest = useRef({ getAccessToken, wallet, wallets, email })
  latest.current = { getAccessToken, wallet, wallets, email }
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const key = (id: string) => `pocket:esim:${encodeURIComponent(email)}:${id}`
  const readSaved = (id: string) => {
    try { return JSON.parse(localStorage.getItem(key(id)) || '{}') || {} } catch { return {} }
  }
  const persist = (id: string, data: Record<string, unknown>) => { localStorage.setItem(key(id), JSON.stringify({ ...readSaved(id), ...data })) }
  useEffect(() => {
    if (existing || !plan || attempted) return
    let disposed = false; setLoading(true); setIntent(null); setError('')
    void (async () => {
      const base = await latest.current.wallet.ensureWallet('base')
      if (!base) throw Error('Open your Base wallet to continue.')
      const result = await pocketEsimRequest(latest.current.getAccessToken, { action: 'quote', requestKey: crypto.randomUUID(), packageCode: plan.id, days, asset })
      if (disposed) return
      const session = await latest.current.wallet.getEvmSession('base', base.address)
      const fee = await readCirclePaymentFeeQuote({ session, recipient: result.recipient, amount: result.intent.price.total, asset, feeMode: 'gross', purpose: 'wallet-send' })
      if (disposed) return
      const bound = await pocketEsimRequest(latest.current.getAccessToken, { action: 'fees', id: result.intent.id, feeQuoteToken: fee.token })
      if (!disposed) setIntent(bound.intent)
    })().catch(reason => { if (!disposed) setError(reason.message) }).finally(() => { if (!disposed) setLoading(false) })
    return () => { disposed = true }
  }, [plan?.id, days, asset, existing?.id, retry])
  useEffect(() => {
    if (!intent || attempted || existing || intent.state !== 'quoted') return
    const refresh = () => { if (Date.now() >= intent.expiresAt && !inFlight.current) setRetry(value => value + 1) }
    const timer = setTimeout(refresh, Math.max(0, intent.expiresAt - Date.now()))
    window.addEventListener('focus', refresh)
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh) }
  }, [intent?.id, intent?.expiresAt, attempted, existing?.id])
  async function check(value: PocketEsimOrder) {
    const stored = readSaved(value.id)
    if (stored.challengeId || stored.txHash) await pocketEsimRequest(latest.current.getAccessToken, { action: 'track', id: value.id, challengeId: stored.challengeId, transactionId: stored.transactionId, txHash: stored.txHash })
    let circleUserToken: string | undefined
    if (value.state === 'awaiting_payment' && !value.txHash) {
      const base = latest.current.wallets.wallets.base
      if (base?.address) circleUserToken = (await latest.current.wallet.getEvmSession('base', base.address)).userToken
    }
    const result = await pocketEsimRequest(latest.current.getAccessToken, { action: 'status', id: value.id, circleUserToken })
    if (alive.current) { setIntent(result.intent); setError('') }
    if (result.intent.state !== value.state) { markPocketActivityDirty(email); void latest.current.wallets.refreshBalances().catch(() => {}) }
    if (['ready', 'refunded', 'payment_failed'].includes(result.intent.state)) { try { localStorage.removeItem(key(value.id)) } catch {} }
    return result.intent as PocketEsimOrder
  }
  const checkRef = useRef(check); checkRef.current = check
  useEffect(() => {
    if (!intent || !attempted || ['ready', 'refunded', 'payment_failed', 'needs_review'].includes(intent.state)) return
    let disposed = false, timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      if (disposed) return
      if (!inFlight.current && document.visibilityState === 'visible') {
        inFlight.current = true
        try { await checkRef.current(intent) } catch (reason) { if (!disposed) setError((reason as Error).message) } finally { inFlight.current = false }
      }
      if (!disposed) timer = setTimeout(poll, 5000)
    }
    timer = setTimeout(poll, 1000)
    return () => { disposed = true; clearTimeout(timer) }
  }, [intent?.id, intent?.state, attempted])
  async function pay() {
    if (!intent || inFlight.current || attempted) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const base = await latest.current.wallet.ensureWallet('base')
      if (!base) throw Error('Open your Base wallet to continue.')
      const session = await latest.current.wallet.getEvmSession('base', base.address)
      const result = await pocketEsimRequest(getAccessToken, { action: 'prepare', id: intent.id })
      const payment = result.payment
      if (payment.payer.toLowerCase() !== base.address.toLowerCase() || payment.asset !== asset || payment.network !== 'base' || payment.amount !== intent.price.total || payment.totalDebit !== intent.totalDebit || !payment.feeQuoteToken) throw Error('Payment details changed. Please review your plan.')
      setAttempted(true); setIntent(result.intent)
      persist(intent.id, { idempotencyKey: payment.idempotencyKey })
      const track = (ids: { challengeId: string; transactionId: string }) => {
        persist(intent.id, ids)
        void pocketEsimRequest(getAccessToken, { action: 'track', id: intent.id, ...ids }).catch(() => {})
      }
      const transfer = await executePocketEvmTransfer({ session, linkedWalletAddress: base.address, recipient: payment.recipient, amount: payment.amount, feeQuoteToken: payment.feeQuoteToken, asset, idempotencyKey: payment.idempotencyKey, confirm: false, onChallenge: track, onAccepted: track })
      if (transfer.txHash) { persist(intent.id, { txHash: transfer.txHash }); await pocketEsimRequest(getAccessToken, { action: 'track', id: intent.id, txHash: transfer.txHash }) }
      await check(result.intent)
    } catch (reason) { if (alive.current) { if ((reason as { code?: string }).code === 'ESIM_QUOTE_EXPIRED') { setError(''); setRetry(value => value + 1) } else setError((reason as Error).message) } } finally { inFlight.current = false; if (alive.current) setBusy(false) }
  }
  const status = pocketEsimStatus(intent?.state || 'quoted')
  if (intent && attempted && intent.state !== 'quoted') return <PocketTransactionSheet title="eSIM" state={status.state} statusLabel={status.label} amount={`${Number(intent.state === 'refunded' ? intent.price.total : (intent.totalDebit || intent.price.total)).toFixed(2)} ${intent.asset}`} detail={error || status.detail} onDone={onClose} detailsRows={[["Plan", intent.packageLabel || plan?.data || 'Travel data'], ['Network', 'Base'], ['Total', `${Number(intent.state === 'refunded' ? intent.price.total : (intent.totalDebit || intent.price.total)).toFixed(2)} ${intent.asset}`], ['Status', status.label]]} />
  return <PocketBottomSheet title="Confirm payment" onClose={onClose} dismissible={!busy}>
    <h2 className="text-lg font-semibold">{plan?.data || 'eSIM'}</h2>
    <div className="my-5 flex gap-2">{(['USDC', 'USDT'] as const).map(value => <button key={value} type="button" disabled={busy || attempted} aria-pressed={asset === value} onClick={() => setAsset(value)} className={`rounded-full px-5 py-2 text-sm ${asset === value ? 'bg-gray-200 dark:bg-[#262626]' : 'text-gray-500'}`}>{value}</button>)}</div>
    {loading ? <div className="space-y-3"><PocketSkeletonBar className="h-5 w-full" /><PocketSkeletonBar className="h-5 w-full" /></div> : intent && <dl className="mb-6 space-y-3 text-sm">{[['Network', 'Base'], ['Plan', `${Number(intent.price.subtotal).toFixed(2)} ${asset}`], ['Fee', `${(Number(intent.price.platformFee) + Number(intent.networkFee || 0)) < .01 ? '<0.01' : (Number(intent.price.platformFee) + Number(intent.networkFee || 0)).toFixed(2)} ${asset}`], ['Total', `${Number(intent.state === 'refunded' ? intent.price.total : (intent.totalDebit || intent.price.total)).toFixed(2)} ${asset}`]].map(([label, value]) => <div key={label} className="flex justify-between"><dt className="text-gray-500">{label}</dt><dd>{value}</dd></div>)}</dl>}
    {error && <p role="status" className="my-4 text-sm text-gray-500">{error}</p>}
    {!loading && !intent && error ? <button className="pocket-cta-primary w-full" onClick={() => setRetry(value => value + 1)}>Try again</button> : <PocketSlideAction loadingContent={loading} status={busy ? 'pending' : 'idle'} disabled={!intent || loading || attempted} onPrepare={async () => { const base = await wallet.ensureWallet('base'); if (!base) throw Error('Open your Base wallet to continue.'); await wallet.getEvmSession('base', base.address) }} onConfirm={() => void pay()} labels={{ idle: 'Confirm payment', pending: 'Confirming payment', disabled: 'Preparing payment' }} />}
  </PocketBottomSheet>
}
