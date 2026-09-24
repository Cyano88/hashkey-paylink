import { useEffect, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ChevronRightIcon } from '@heroicons/react/24/outline'

type Event = {
  id: string; cursor: string; projectId: string; environment: string; product: string;
  recordId: string; event: string; occurredAt: string; recordedAt: string;
  details: Record<string, string>;
}
type Page = { events: Event[]; nextCursor: string | null; coverage: string }
const emptyPage: Page = { events: [], nextCursor: null, coverage: '' }
const eventTitles: Record<string, string> = {
  'checkout.pending': 'Awaiting payment',
  'payment.paid': 'Payment confirmed',
  'payment.gateway_accepted': 'Gateway payment accepted',
  'checkout.payment_accepted': 'Checkout payment accepted',
  'funding.created': 'Funding request created',
  'funding.funded': 'Bridge completion reported',
}
function eventTitle(event: string) {
  const title = eventTitles[event] ?? event.replace(/[._]/g, ' ')
  return title.charAt(0).toUpperCase() + title.slice(1)
}

export default function PaymentActivityPanel({ projectId }: { projectId: string }) {
  const { getAccessToken, user } = usePrivy()
  const [page, setPage] = useState<Page>(emptyPage)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reference, setReference] = useState('')
  const [filter, setFilter] = useState('')
  const generation = useRef(0)

  async function load(cursor?: string) {
    const request = ++generation.current
    setLoading(true)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw Error('Sign in again to view activity.')
      const query = new URLSearchParams({ resource: 'activity', projectId, environment: 'live', limit: '50' })
      if (cursor) query.set('cursor', cursor)
      if (filter) query.set('recordId', filter)
      const response = await fetch('/api/developer-projects?' + query, {
        headers: { authorization: `Bearer ${token}` }, cache: 'no-store',
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw Error(data.error || 'Activity could not be loaded.')
      if (request !== generation.current) return
      if (!Array.isArray(data.events) || data.events.some((e: Event) => e.projectId !== projectId || e.environment !== 'live')) {
        throw Error('Activity response does not match this project.')
      }
      setPage(current => ({
        ...data,
        events: cursor
          ? [...current.events, ...data.events.filter((e: Event) => !current.events.some(old => old.id === e.id))]
          : data.events,
      }))
    } catch (reason) {
      if (request === generation.current) setError(reason instanceof Error ? reason.message : 'Activity could not be loaded.')
    } finally {
      if (request === generation.current) setLoading(false)
    }
  }

  useEffect(() => {
    setPage(emptyPage)
    void load()
    return () => { generation.current++ }
  }, [projectId, filter, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function download() {
    const blob = new Blob([JSON.stringify({
      projectId, environment: 'live', exportedAt: new Date().toISOString(), scope: 'loaded_events',
      hasMore: Boolean(page.nextCursor), coverage: page.coverage, events: page.events,
    }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${projectId}-activity.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div>
    <header>
      <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
      <p className="mt-2 text-sm leading-6 text-gray-500">Payment lifecycle records for this project.</p>
    </header>
    <p className="mt-5 rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-600 dark:bg-white/5 dark:text-gray-300">
      Records are retained separately from checkout sessions. Older activity may be incomplete.
      Payment acceptance, bank payout and bridge completion appear separately.
    </p>
    <form className="mt-5 flex flex-wrap items-end gap-3" onSubmit={e => {
      e.preventDefault()
      if (reference.trim() === filter) void load()
      else setFilter(reference.trim())
    }}>
      <label className="min-w-0 flex-1 text-sm">
        Checkout, Agreement or Funding reference
        <input aria-label="Payment reference" value={reference} onChange={e => setReference(e.target.value)}
          placeholder="Exact reference, or leave blank"
          className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-transparent px-3 dark:border-white/10" />
      </label>
      <button disabled={loading} type="submit" className="developer-primary">Search</button>
    </form>
    <div className="mt-4 flex flex-wrap gap-4">
      <button className="min-h-11 text-sm font-semibold" disabled={loading} onClick={() => void load()}>Refresh</button>
      <button className="min-h-11 text-sm font-semibold" disabled={loading || !page.events.length} onClick={download}>Export loaded records</button>
    </div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
      {error} <button className="underline" disabled={loading} onClick={() => void load()}>Try again</button>
    </p>}
    <div className="mt-3 divide-y divide-gray-100 dark:divide-white/10">
      {page.events.map(event => <details key={event.id} className="py-4">
        <summary className="flex cursor-pointer list-none items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block break-words text-sm font-semibold">{eventTitle(event.event)}</span>
            <span className="mt-1 block break-all text-xs text-gray-500">{event.recordId}</span>
            <time className="mt-1 block text-xs text-gray-500" dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString()}</time>
          </span>
          {event.details.amount && <span className="max-w-24 break-words text-right text-xs font-medium">{event.details.amount} {event.details.asset}</span>}
          <ChevronRightIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
        </summary>
        <dl className="mt-4 space-y-3 rounded-xl bg-gray-50 p-4 text-sm dark:bg-white/5">
          {Object.entries({ product: event.product, environment: event.environment, recordedAt: event.recordedAt, ...event.details, eventId: event.id }).map(([key, value]) => <div key={key}>
            <dt className="text-gray-500">{key}</dt><dd className="break-all">{value}</dd>
          </div>)}
        </dl>
      </details>)}
    </div>
    {loading && <p role="status" className="py-5 text-sm text-gray-500">Loading activity...</p>}
    {!loading && !error && !page.events.length && <p role="status" className="py-10 text-center text-sm text-gray-500">
      No recorded activity{filter ? ' for this reference' : ' for this project'} yet.
    </p>}
    {page.nextCursor && <button disabled={loading} onClick={() => void load(page.nextCursor!)} className="developer-primary mt-5">Load more</button>}
  </div>
}
