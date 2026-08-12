import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PocketFlowHeader from '../components/PocketFlowHeader'
import { AlertCircle, Bell, Check, Loader2, XCircle } from '../components/PocketIcons'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { decidePocketRequest, readPocketRequests, type PocketRequestItem } from '../api/pocketRequestsClient'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'

export default function PocketNotificationsPage() {
  const navigate = useNavigate()
  const { authenticated, getAccessToken } = usePocketIdentity()
  const [items, setItems] = useState<PocketRequestItem[]>([])
  const [busy, setBusy] = useState(true)
  const [acting, setActing] = useState('')
  const [error, setError] = useState('')
  const load = async () => {
    if (!authenticated) { setBusy(false); return }
    setBusy(true); setError('')
    try { const token = await getAccessToken(); if (!token) throw new Error('Sign in again to read requests.'); setItems(await readPocketRequests(token)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load requests.') }
    finally { setBusy(false) }
  }
  useEffect(() => { void load() }, [authenticated]) // eslint-disable-line react-hooks/exhaustive-deps
  const decide = async (id: string, decision: 'accept' | 'decline') => {
    setActing(id + decision); setError('')
    try { const token = await getAccessToken(); if (!token) throw new Error('Sign in again to respond.'); const next = await decidePocketRequest(token, id, decision); setItems(current => current.map(item => item.id === id ? next : item)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not respond to this request.') }
    finally { setActing('') }
  }
  return <div className="fixed inset-0 z-[45] overflow-y-auto bg-[#F5F5F7] text-gray-950 dark:bg-[#0A0A0A] dark:text-white"><main className="mx-auto min-h-full w-full max-w-[480px] px-5 pb-8 pt-[max(1rem,env(safe-area-inset-top))]"><PocketFlowHeader title="Notifications" onBack={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.home)} />
    {busy ? <section className="mt-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-gray-400" /></section> : error ? <section className="mt-20 text-center"><AlertCircle className="mx-auto h-7 w-7 text-gray-300" /><p className="mt-4 text-sm font-bold">Notifications could not load</p><p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-gray-400">{error}</p><button type="button" onClick={() => void load()} className="mt-5 min-h-11 rounded-full bg-gray-950 px-6 text-xs font-semibold text-white dark:bg-white dark:text-gray-950">Try again</button></section> : items.length ? <section className="mt-7 space-y-3">{items.map(item => <article key={item.id} className="rounded-[24px] bg-white p-4 shadow-sm dark:bg-white/[0.05]">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black">{item.title}</p><p className="mt-1 text-[11px] text-gray-400">{item.direction === 'incoming' ? 'From ' + item.senderName : 'To Pocket ' + item.recipientPocketId}</p></div><span className="rounded-full bg-gray-100 px-2.5 py-1 text-[9px] font-black uppercase text-gray-500 dark:bg-white/[0.08]">{item.status}</span></div>
      <p className="mt-4 text-xl font-black tabular-nums">{item.flexibleAmount ? 'Open amount' : item.amount + ' USDC'}</p>
      {item.direction === 'incoming' && item.status === 'pending' && <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => void decide(item.id, 'decline')} disabled={Boolean(acting)} className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-gray-200 text-xs font-bold disabled:opacity-50 dark:border-white/10"><XCircle className="h-4 w-4" />Decline</button><button type="button" onClick={() => void decide(item.id, 'accept')} disabled={Boolean(acting)} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-gray-950 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950"><Check className="h-4 w-4" />Accept</button></div>}
      {item.direction === 'incoming' && item.status === 'accepted' && <button type="button" onClick={() => window.location.assign(item.paymentUrl)} className="mt-4 min-h-12 w-full rounded-full bg-gray-950 text-xs font-bold text-white dark:bg-white dark:text-gray-950">Pay request</button>}
    </article>)}</section> : <section className="mt-20 text-center"><Bell className="mx-auto h-7 w-7 text-gray-300" /><p className="mt-4 text-sm font-black">No notifications yet</p><p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-gray-400">Pocket requests and their accepted, declined, or paid updates will appear here.</p></section>}
    {error && items.length > 0 && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">{error}</p>}
  </main></div>
}
