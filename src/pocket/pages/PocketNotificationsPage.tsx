import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import PocketFlowHeader from '../components/PocketFlowHeader'
import { AlertCircle, Bell, Check, Loader2, XCircle } from '../components/PocketIcons'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { decidePocketRequest, markPocketRequestsRead, POCKET_REQUESTS_UPDATED_EVENT, readPocketRequests, reconcilePocketRequest, type PocketRequestItem } from '../api/pocketRequestsClient'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'
import { registerPocketRefreshHandler } from '../lib/pocketRefresh'

export default function PocketNotificationsPage() {
  const navigate = useNavigate()
  const { authenticated, getAccessToken } = usePocketIdentity()
  const [items, setItems] = useState<PocketRequestItem[]>([])
  const [busy, setBusy] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [acting, setActing] = useState('')
  const [error, setError] = useState('')
  const scrollerRef = useRef<HTMLDivElement>(null)
  const pullStartY = useRef<number | null>(null)
  const pullDistanceRef = useRef(0)
  const refreshTriggered = useRef(false)
  const lastReconcileAt = useRef(0)

  const load = useCallback(async ({ showBusy = false, markRead = false } = {}) => {
    if (!authenticated) { setBusy(false); return }
    if (showBusy) setBusy(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to read requests.')
      const next = await readPocketRequests(token)
      let resolved = next
      const accepted = next.filter(item => item.status === 'accepted').slice(0, 4)
      if (accepted.length && Date.now() - lastReconcileAt.current >= 30_000) {
        lastReconcileAt.current = Date.now()
        const updates = await Promise.all(accepted.map(item => reconcilePocketRequest(token, item.id).catch(() => item)))
        const byId = new Map(updates.map(item => [item.id, item]))
        resolved = next.map(item => byId.get(item.id) ?? item)
      }
      setItems(resolved)
      setError('')
      if (markRead) await markPocketRequestsRead(token)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load requests.')
    } finally {
      if (showBusy) setBusy(false)
    }
  }, [authenticated, getAccessToken])

  const refresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    pullDistanceRef.current = 32
    setPullDistance(32)
    try {
      const refreshWork = load({ markRead: true })
      await Promise.race([refreshWork, new Promise(resolve => window.setTimeout(resolve, 3_000))])
    }
    finally { pullDistanceRef.current = 0; setRefreshing(false); setPullDistance(0) }
  }, [load, refreshing])

  useEffect(() => { void load({ showBusy: true, markRead: true }) }, [load])
  useEffect(() => {
    if (!authenticated) return
    const update = () => { void load() }
    const visibility = () => { if (document.visibilityState === 'visible') update() }
    const interval = window.setInterval(update, 15_000)
    const unregister = registerPocketRefreshHandler(update)
    window.addEventListener(POCKET_REQUESTS_UPDATED_EVENT, update)
    window.addEventListener('focus', update)
    window.addEventListener('online', update)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.clearInterval(interval)
      unregister()
      window.removeEventListener(POCKET_REQUESTS_UPDATED_EVENT, update)
      window.removeEventListener('focus', update)
      window.removeEventListener('online', update)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [authenticated, load])

  const startPull = (event: TouchEvent<HTMLDivElement>) => {
    if (refreshing || event.touches.length !== 1 || (scrollerRef.current?.scrollTop ?? 0) > 0) return
    refreshTriggered.current = false
    pullStartY.current = event.touches[0].clientY
  }
  const movePull = (event: TouchEvent<HTMLDivElement>) => {
    if (pullStartY.current === null || event.touches.length !== 1 || (scrollerRef.current?.scrollTop ?? 0) > 0) return
    const distance = Math.min(58, Math.max(0, (event.touches[0].clientY - pullStartY.current) * 0.62))
    pullDistanceRef.current = distance
    setPullDistance(distance)
    if (distance >= 30 && !refreshTriggered.current) { refreshTriggered.current = true; void refresh() }
  }
  const finishPull = () => {
    pullStartY.current = null
    if (pullDistanceRef.current >= 30 && !refreshTriggered.current) void refresh()
    else { pullDistanceRef.current = 0; setPullDistance(0) }
  }

  const decide = async (id: string, decision: 'accept' | 'decline') => {
    setActing(id + decision); setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to respond.')
      const next = await decidePocketRequest(token, id, decision)
      setItems(current => current.map(item => item.id === id ? next : item))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not respond to this request.') }
    finally { setActing('') }
  }
  const openPayment = (item: PocketRequestItem) => {
    if (!item.paymentPath) { setError('This request is missing its Pocket payment route. Ask the sender to create it again.'); return }
    navigate(POCKET_BASE_PATH + item.paymentPath)
  }

  return <div ref={scrollerRef} onTouchStart={startPull} onTouchMove={movePull} onTouchEnd={finishPull} onTouchCancel={() => { pullStartY.current = null; if (!refreshing) { pullDistanceRef.current = 0; setPullDistance(0) } }} className="fixed inset-0 z-[45] overflow-y-auto overscroll-y-contain bg-[#F5F5F7] text-gray-950 dark:bg-[#0A0A0A] dark:text-white">
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-[max(.5rem,env(safe-area-inset-top))] z-[60] flex justify-center transition-opacity duration-150" style={{ opacity: pullDistance > 4 || refreshing ? 1 : 0, transform: `translateY(${Math.max(0, pullDistance - 30)}px)` }}><span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm ring-1 ring-gray-200/70 dark:bg-[#17181c] dark:text-gray-300 dark:ring-white/10"><Loader2 className="h-3.5 w-3.5" /></span></div>
    <main className="mx-auto min-h-full w-full max-w-[480px] px-5 pb-8 pt-[max(1rem,env(safe-area-inset-top))]"><PocketFlowHeader title="Notifications" onBack={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.home)} />
      {busy ? <section className="mt-24 text-center"><Loader2 className="mx-auto h-6 w-6 text-gray-400" /></section> : error && !items.length ? <section className="mt-20 text-center"><AlertCircle className="mx-auto h-7 w-7 text-gray-300" /><p className="mt-4 text-sm font-bold">Notifications could not load</p><p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-gray-400">{error}</p><button type="button" onClick={() => void load({ showBusy: true, markRead: true })} className="mt-5 min-h-11 rounded-full bg-gray-950 px-6 text-xs font-semibold text-white dark:bg-white dark:text-gray-950">Try again</button></section> : items.length ? <section className="mt-7 space-y-3">{items.map(item => <article key={item.id} className="rounded-[24px] bg-white p-4 shadow-sm dark:bg-white/[0.05]">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black">{item.title}</p><p className="mt-1 text-[11px] text-gray-400">{item.direction === 'incoming' ? `From ${item.senderName}` : `To ${item.recipientName}`}</p><p className="mt-1 text-[10px] font-medium text-gray-400">Sent {new Date(item.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })} at {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div><span className="rounded-full bg-gray-100 px-2.5 py-1 text-[9px] font-black uppercase text-gray-500 dark:bg-white/[0.08]">{item.status === 'paid' ? 'Paid' : item.status === 'accepted' ? 'Accepted' : item.status === 'declined' ? 'Declined' : 'Awaiting response'}</span></div>
        <p className="mt-4 text-xl font-black tabular-nums">{item.amount} USDC</p>
        {item.direction === 'incoming' && item.status === 'pending' && <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => void decide(item.id, 'decline')} disabled={Boolean(acting)} className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-gray-200 text-xs font-bold disabled:opacity-50 dark:border-white/10"><XCircle className="h-4 w-4" />Decline</button><button type="button" onClick={() => void decide(item.id, 'accept')} disabled={Boolean(acting)} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-gray-950 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950"><Check className="h-4 w-4" />Accept</button></div>}
        {item.direction === 'incoming' && item.status === 'accepted' && <button type="button" onClick={() => openPayment(item)} className="mt-4 min-h-12 w-full rounded-full bg-gray-950 text-xs font-bold text-white dark:bg-white dark:text-gray-950">Pay request</button>}
      </article>)}</section> : <section className="mt-20 text-center"><Bell className="mx-auto h-7 w-7 text-gray-300" /><p className="mt-4 text-sm font-black">No notifications yet</p><p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-gray-400">Pocket requests and their accepted, declined, or paid updates will appear here.</p></section>}
      {error && items.length > 0 && <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-3 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">Could not refresh notifications. Pull down to try again.</p>}
    </main>
  </div>
}
