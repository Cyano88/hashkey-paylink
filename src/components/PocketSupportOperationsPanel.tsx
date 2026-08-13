import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { Check, Loader2, RefreshCw, Send } from 'lucide-react'

type SupportMessage = { id: string; author: 'user' | 'agent' | 'staff'; kind?: 'automatic_reminder' | 'automatic_resolution'; text: string; createdAt: number }
type SupportCase = {
  id: string
  status: 'open' | 'assigned' | 'waiting_user' | 'resolved'
  category: string
  priority: 'normal' | 'high'
  summary: string
  assignedTo?: string
  customer?: { fullName: string; email: string; pocketId: string }
  messages: SupportMessage[]
  createdAt: number
  updatedAt: number
}

function when(value: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

async function readSupportResponse(response: Response) {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(response.status >= 500
      ? 'Pocket Support is reconnecting. Your loaded conversation is safe; try again in a moment.'
      : 'Pocket Support returned an unexpected response. Please refresh and try again.')
  }
  try {
    return await response.json() as { ok?: boolean; cases?: SupportCase[]; case?: SupportCase; error?: string }
  } catch {
    throw new Error('Pocket Support returned an incomplete response. Please try again.')
  }
}

export default function PocketSupportOperationsPanel() {
  const { getAccessToken } = usePrivy()
  const [cases, setCases] = useState<SupportCase[]>([])
  const [activeId, setActiveId] = useState('')
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const call = useCallback(async (body: Record<string, unknown>) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to continue.')
    const response = await fetch('/api/pocket/support/cases', {
      method: 'POST', cache: 'no-store',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await readSupportResponse(response)
    if (!response.ok || !data.ok) throw new Error(data.error || 'Support request failed.')
    return data
  }, [getAccessToken])

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    if (!quiet) setError('')
    try {
      const data = await call({ action: 'staff-list' })
      const next = data.cases || []
      setCases(next)
      setActiveId(current => current && next.some(item => item.id === current) ? current : next[0]?.id || '')
      setError('')
    } catch (reason) {
      if (!quiet) setError(reason instanceof Error ? reason.message : 'Support cases could not be loaded.')
    } finally { if (!quiet) setLoading(false) }
  }, [call])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(true), 15000)
    return () => window.clearInterval(timer)
  }, [load])

  const active = useMemo(() => cases.find(item => item.id === activeId), [activeId, cases])
  async function operate(action: 'staff-reply' | 'staff-assign' | 'staff-resolve') {
    if (!active || (action === 'staff-reply' && !reply.trim())) return
    setBusy(true); setError('')
    try {
      await call({ action, caseId: active.id, ...(action === 'staff-reply' ? { message: reply.trim() } : {}) })
      setReply('')
      await load(true)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Support action failed.') }
    finally { setBusy(false) }
  }

  if (loading) return <div className="mt-7 flex min-h-48 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
  return <section className="mt-7">
    <div className="mb-4 flex items-center justify-between">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">Customer operations</p><h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-gray-950 dark:text-white">Pocket Support inbox</h1><p className="mt-1 text-xs text-gray-500">Only Agent Hash handoffs and human replies appear here.</p></div>
      <button type="button" onClick={() => void load()} className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold dark:border-white/10 dark:bg-[#111216]"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
    </div>
    {error && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
    {!cases.length ? <div className="rounded-3xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-white/10 dark:bg-[#111216]">No support cases yet.</div> :
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <div className="space-y-2">{cases.map(item => <button key={item.id} type="button" onClick={() => setActiveId(item.id)} className={`w-full rounded-2xl border p-3 text-left ${item.id === activeId ? 'border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950' : 'border-gray-200 bg-white dark:border-white/10 dark:bg-[#111216]'}`}>
          <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{item.id}</span><span className="text-[10px] uppercase">{item.status.replace('_', ' ')}</span></div>
          <p className="mt-2 line-clamp-2 text-xs opacity-70">{item.summary}</p>
        </button>)}</div>
        {active && <div className="rounded-3xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#111216] sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">{active.summary}</p><p className="mt-1 text-[11px] text-gray-500">{active.category.replace('_', ' ')} · {active.priority} · {when(active.createdAt)}</p></div><div className="flex gap-2"><button disabled={busy} onClick={() => void operate('staff-assign')} className="rounded-full border border-gray-200 px-3 py-2 text-xs font-semibold dark:border-white/10">Assign to me</button><button disabled={busy || active.status === 'resolved'} onClick={() => void operate('staff-resolve')} className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-2 text-xs font-semibold dark:border-white/10"><Check className="h-3.5 w-3.5" />Resolve</button></div></div>
          {active.customer && <div className="mt-4 grid gap-2 rounded-2xl bg-gray-50 p-3 text-xs dark:bg-white/[0.04] sm:grid-cols-3"><div><p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">Full name</p><p className="mt-1 font-semibold">{active.customer.fullName || 'Not verified'}</p></div><div><p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">Email</p><p className="mt-1 truncate font-semibold">{active.customer.email || 'Unavailable'}</p></div><div><p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">Pocket ID</p><p className="mt-1 font-semibold tabular-nums">{active.customer.pocketId || 'Unavailable'}</p></div></div>}
          <div className="my-5 max-h-[24rem] space-y-3 overflow-y-auto">{active.messages.map(message => <div key={message.id} className={`max-w-[86%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${message.author === 'staff' ? 'ml-auto bg-gray-950 text-white dark:bg-white dark:text-gray-950' : 'bg-gray-100 dark:bg-white/[0.06]'}`}><p>{message.text}</p><p className="mt-1 text-[9px] opacity-50">{message.author} · {when(message.createdAt)}</p></div>)}</div>
          <div className="flex gap-2"><textarea value={reply} onChange={event => setReply(event.target.value)} placeholder="Reply as Pocket Support" className="min-h-12 flex-1 resize-none rounded-2xl border border-gray-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-gray-500 dark:border-white/10" /><button disabled={busy || !reply.trim()} onClick={() => void operate('staff-reply')} className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-950 text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div>
        </div>}
      </div>}
  </section>
}
