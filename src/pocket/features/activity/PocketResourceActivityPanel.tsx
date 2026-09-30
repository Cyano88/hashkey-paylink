import PocketRecentActivitySkeleton from '../../components/PocketRecentActivitySkeleton'
import { currentPocketActivityRow } from '../../lib/pocketActivityPresentation'
import { pocketActivityStatus } from '../../lib/pocketReceipt'
import { isIncomingPosPayment } from '../../lib/pocketPurchaseKind'
import { useEffect, useMemo, useState } from 'react'
import { CheckCheck, Copy, Store, Users } from '../../components/PocketIcons'
import { ArrowTopRightOnSquareIcon as ExternalLink } from '@heroicons/react/24/outline'
import { useSearchParams } from 'react-router-dom'
import { copyToClipboard, formatNgnAmount } from '../../../lib/utils'
import type { PocketActivityRow } from '../../models/pocketActivity'
import type { PocketCollectionResource, PocketPosResource } from '../../lib/pocketSchemas'
import { formatPocketDisplayAmount } from '../../lib/pocketMoney'
import { hashPayLinkAppOriginForOrigin } from '../../lib/pocketRoutes'
import PocketActivityReceipt from '../../components/PocketActivityReceipt'
import type { PocketRequestItem } from '../../api/pocketRequestsClient'

type Props = {
  view: 'pos' | 'collections'
  rows: PocketActivityRow[]
  merchants: PocketPosResource[]
  collections: PocketCollectionResource[]
  requests: PocketRequestItem[]
  busy: boolean
  error: string
  requestsError?: string
}

type ActivityResource = {
  id: string
  title: string
  createdAt: number
  paymentUrl?: string
  kind: 'pos' | 'collection' | 'request'
  request?: PocketRequestItem
}

function resourceTitle(resource: ActivityResource) {
  if (resource.request?.status === 'paid') return resource.request.direction === 'outgoing' ? 'USDC received' : 'USDC sent'
  return resource.title
}

function rowSource(row: PocketActivityRow) {
  return String(row.source ?? '').toLowerCase()
}

function displayAmount(row: PocketActivityRow) {
  const ngn = formatNgnAmount(row.amountNgn ?? '')
  if (ngn) return `NGN ${ngn}`
  const usdc = Number.parseFloat(row.amount || '')
  return Number.isFinite(usdc) ? `${formatPocketDisplayAmount(usdc)} USDC` : 'Payment'
}

function totalLabel(input: PocketActivityRow[]) {
  const rows = input.filter(row => ['confirmed','completed','successful','paid','settled','delivered','validated'].includes(pocketActivityStatus(row)))
  const ngnValues = rows.map(row => Number.parseFloat(row.amountNgn || '')).filter(Number.isFinite)
  if (ngnValues.length === rows.length && rows.length > 0) {
    return `NGN ${formatNgnAmount(String(ngnValues.reduce((sum, value) => sum + value, 0)))}`
  }
  const usdc = rows.reduce((sum, row) => {
    const value = Number.parseFloat(row.amount || '')
    return Number.isFinite(value) ? sum + value : sum
  }, 0)
  return `${formatPocketDisplayAmount(usdc)} USDC`
}

export default function PocketResourceActivityPanel({ view, rows, merchants, collections, requests, busy, error, requestsError = '' }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [copiedId, setCopiedId] = useState('')
  const [selectedPayment, setSelectedPayment] = useState<PocketActivityRow | null>(null)
  const key = view === 'pos' ? 'terminal' : 'collection'
  const selectedId = searchParams.get(key) ?? ''
  useEffect(() => { setSelectedPayment(null) }, [selectedId])
  const resources = useMemo<ActivityResource[]>(() => view === 'pos'
    ? merchants.filter(merchant => !merchant.source || merchant.source === 'pos').map(merchant => ({
        id: merchant.merchant_id,
        title: merchant.display_name,
        createdAt: merchant.created_at ? Date.parse(merchant.created_at) : 0,
        paymentUrl: `${hashPayLinkAppOriginForOrigin(window.location.origin)}/pos/ng?merchant_id=${encodeURIComponent(merchant.merchant_id)}`,
        kind: 'pos' as const,
      }))
    : [
        ...requests.map(request => ({ id: request.id, title: request.title, createdAt: request.createdAt, kind: 'request' as const, request })),
        ...collections.map(collection => ({ id: collection.eventId, title: collection.title, createdAt: collection.createdAt, paymentUrl: collection.paymentUrl, kind: 'collection' as const })),
      ].sort((a, b) => b.createdAt - a.createdAt), [collections, merchants, requests, view])
  const selected = resources.find(resource => resource.id === selectedId)
  const resourceRows = (resourceId: string) => rows.filter(row => view === 'pos'
    ? isIncomingPosPayment(row) && row.merchantId === resourceId
    : resourceId.startsWith('preq_')
      ? rowSource(row) === 'request' && !['declined','accepted','pending','awaiting response'].includes(pocketActivityStatus(row)) && (row.eventId === resourceId || row.eventId === resources.find(resource => resource.id === resourceId)?.request?.eventId)
      : rowSource(row) === 'collection' && row.eventId === resourceId)

  const copyLink = async (id: string, paymentUrl: string) => {
    await copyToClipboard(paymentUrl)
    setCopiedId(id)
    window.setTimeout(() => setCopiedId(''), 1_800)
  }

  if (selected) {
    const declined = selected.request?.status === 'declined'
    const payments = declined ? [] : resourceRows(selected.id).sort((a, b) => b.ts - a.ts)
    const visibleError = selected.request ? requestsError || (declined ? '' : error) : error
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-[#262626] dark:bg-[#0D0D0D]">
          <div className="flex items-start justify-between gap-3">

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{selected.kind === 'pos' ? 'POS terminal' : selected.kind === 'request' ? 'Personal request' : 'Collection'}</p>
              <h2 className="mt-1 truncate text-lg font-semibold text-gray-950 dark:text-white">{resourceTitle(selected)}</h2>
              <p className="mt-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400">{selected.request ? `${selected.request.amount} USDC · ${selected.request.direction === 'outgoing' ? `To ${selected.request.recipientName}` : `From ${selected.request.senderName}`}` : `${payments.length} payment${payments.length === 1 ? '' : 's'} · ${totalLabel(payments)}`}</p>
            </div>
            {selected.paymentUrl && <div className="flex shrink-0 items-center gap-1.5">
              <a href={selected.paymentUrl} target="_blank" rel="noreferrer" aria-label="Open payment link" className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 dark:border-[#262626] dark:bg-[#121212] dark:text-gray-300">
                <ExternalLink className="h-4 w-4" />
              </a>
              <button type="button" aria-label="Copy payment link" onClick={() => void copyLink(selected.id, selected.paymentUrl!)} className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 dark:border-[#262626] dark:bg-[#121212] dark:text-gray-300">
                {copiedId === selected.id ? <CheckCheck className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>}
          </div>
          {selected.request && <div className="mt-4 grid grid-cols-2 gap-2 border-t border-gray-100 pt-4 text-xs dark:border-[#262626]"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</p><p className="mt-1 font-bold capitalize">{selected.request.status === 'pending' ? 'Awaiting response' : selected.request.status}</p></div><div><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Network</p><p className="mt-1 font-bold capitalize">{selected.request.network}</p></div></div>}
        </div>

        {selectedPayment && <PocketActivityReceipt row={(currentPocketActivityRow(selectedPayment, rows) || selectedPayment)} onClose={() => setSelectedPayment(null)} />}
        {visibleError && !payments.length ? <p className="rounded-2xl bg-gray-100 px-4 py-3 text-xs font-semibold text-gray-500 dark:bg-[#121212] dark:text-gray-300">{visibleError}</p> : null}
        {declined ? <p className="px-1 text-xs text-gray-500 dark:text-gray-400">No payment was made.</p> : payments.length ? (
          <div className="space-y-2">
            {payments.map((row, index) => {
              const paymentId = `${row.txHash}-${row.ts}-${index}`
              return (
                <div key={paymentId} className="py-3.5">
                  <button type="button" onClick={() => setSelectedPayment(row)} className="flex w-full items-center justify-between gap-3 text-left">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{view === 'collections' ? row.memo || row.payer || 'Payer' : row.payer || row.memo || 'Payer'}</span>
                      <span className="mt-0.5 block text-[11px] font-medium text-gray-500 dark:text-gray-400">{new Date(row.ts).toLocaleDateString()} at {new Date(row.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs font-bold tabular-nums text-gray-900 dark:text-gray-100">{displayAmount(row)}</span>
                      <span className="mt-0.5 block text-[10px] font-semibold capitalize text-gray-500 dark:text-gray-400">{row.paycrestStatus || 'Status unavailable'}</span>
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        ) : busy ? <PocketRecentActivitySkeleton /> : !busy ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center dark:border-[#262626] dark:bg-[#0D0D0D]">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selected.request ? selected.request.status === 'paid' ? 'Payment is syncing' : 'No payment yet' : 'No payments yet'}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{selected.request ? selected.request.status === 'paid' ? 'The confirmed transfer will appear here when Activity finishes syncing.' : selected.request.direction === 'incoming' && selected.request.status === 'accepted' ? 'Open Notifications when you are ready to pay.' : 'Pocket will update this request when its status changes.' : 'Share the collection link when you are ready to receive.'}</p>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {(requestsError || error) && !resources.length ? <p className="rounded-2xl bg-gray-100 px-4 py-3 text-xs font-semibold text-gray-500 dark:bg-[#121212] dark:text-gray-300">{requestsError || error}</p> : null}
      {resources.length ? (
        <div className="space-y-2">
          {resources.map(resource => {
            const payments = resourceRows(resource.id)
            return (
              <div key={resource.id} className="flex w-full items-center gap-2 py-2">
                <button type="button" onClick={() => setSearchParams({ kind: searchParams.get('kind') || 'requests', [key]: resource.id })} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 text-left">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-[#121212] dark:text-gray-300">{view === 'pos' ? <Store className="h-4 w-4" /> : <Users className="h-4 w-4" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{resourceTitle(resource)}</span>
                  <span className="mt-0.5 block text-[11px] font-medium text-gray-500 dark:text-gray-400">{resource.request ? `${resource.request.direction === 'outgoing' ? `To ${resource.request.recipientName}` : `From ${resource.request.senderName}`} · ${resource.request.amount} USDC · ${resource.request.status === 'pending' ? 'Awaiting response' : resource.request.status.charAt(0).toUpperCase() + resource.request.status.slice(1)}` : `${payments.length} payment${payments.length === 1 ? '' : 's'} · ${totalLabel(payments)}`}</span>
                </span>
                </button>
                {resource.paymentUrl && <><a href={resource.paymentUrl} target="_blank" rel="noreferrer" aria-label="Open payment link" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500 dark:border-[#262626] dark:text-gray-300">
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button type="button" aria-label="Copy payment link" onClick={() => void copyLink(resource.id, resource.paymentUrl!)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500 dark:border-[#262626] dark:text-gray-300">
                  {copiedId === resource.id ? <CheckCheck className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </button></>}
              </div>
            )
          })}
        </div>
      ) : busy ? <PocketRecentActivitySkeleton /> : !busy ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center dark:border-[#262626] dark:bg-[#0D0D0D]">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">No {view === 'pos' ? 'terminals' : 'requests or collections'} yet</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{view === 'pos' ? 'Create a POS terminal and it will appear here.' : 'Create one from Receive and it will appear here.'}</p>
        </div>
      ) : null}
    </div>
  )
}
