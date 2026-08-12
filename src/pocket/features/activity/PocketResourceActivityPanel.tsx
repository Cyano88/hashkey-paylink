import { useMemo, useState } from 'react'
import { ArrowLeft, CheckCheck, Copy, Store, Users } from '../../components/PocketIcons'
import { ArrowTopRightOnSquareIcon as ExternalLink } from '@heroicons/react/24/outline'
import { useSearchParams } from 'react-router-dom'
import { copyToClipboard, formatNgnAmount } from '../../../lib/utils'
import type { PocketActivityRow } from '../../models/pocketActivity'
import type { PocketCollectionResource, PocketPosResource } from '../../lib/pocketSchemas'
import { formatPocketDisplayAmount } from '../../lib/pocketMoney'
import { hashPayLinkAppOriginForOrigin } from '../../lib/pocketRoutes'
import UnifiedReceipt from '../../../components/UnifiedReceipt'
import { pocketActivityReceipt } from '../../lib/pocketReceipt'

type Props = {
  view: 'pos' | 'collections'
  rows: PocketActivityRow[]
  merchants: PocketPosResource[]
  collections: PocketCollectionResource[]
  busy: boolean
  error: string
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

function totalLabel(rows: PocketActivityRow[]) {
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

export default function PocketResourceActivityPanel({ view, rows, merchants, collections, busy, error }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [copiedId, setCopiedId] = useState('')
  const [expandedPaymentId, setExpandedPaymentId] = useState('')
  const key = view === 'pos' ? 'terminal' : 'collection'
  const selectedId = searchParams.get(key) ?? ''
  const resources = useMemo(() => view === 'pos'
    ? merchants.filter(merchant => !merchant.source || merchant.source === 'pos').map(merchant => ({
        id: merchant.merchant_id,
        title: merchant.display_name,
        createdAt: merchant.created_at ? Date.parse(merchant.created_at) : 0,
        paymentUrl: `${hashPayLinkAppOriginForOrigin(window.location.origin)}/pos/ng?merchant_id=${encodeURIComponent(merchant.merchant_id)}`,
      }))
    : collections.map(collection => ({
        id: collection.eventId,
        title: collection.title,
        createdAt: collection.createdAt,
        paymentUrl: collection.paymentUrl,
      })), [collections, merchants, view])
  const selected = resources.find(resource => resource.id === selectedId)
  const resourceRows = (resourceId: string) => rows.filter(row => view === 'pos'
    ? ['ngpos', 'pos'].includes(rowSource(row)) && row.merchantId === resourceId
    : rowSource(row) === 'collection' && row.eventId === resourceId)

  const copyLink = async (id: string, paymentUrl: string) => {
    await copyToClipboard(paymentUrl)
    setCopiedId(id)
    window.setTimeout(() => setCopiedId(''), 1_800)
  }

  if (selected) {
    const payments = resourceRows(selected.id).sort((a, b) => b.ts - a.ts)
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111216]">
          <div className="flex items-start justify-between gap-3">
            <button type="button" aria-label={`Back to ${view}`} onClick={() => setSearchParams({})} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">{view === 'pos' ? 'POS terminal' : 'Payment request'}</p>
              <h2 className="mt-1 truncate text-lg font-black text-gray-950 dark:text-white">{selected.title}</h2>
              <p className="mt-0.5 text-xs font-semibold text-gray-400">{payments.length} payment{payments.length === 1 ? '' : 's'} · {totalLabel(payments)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <a href={selected.paymentUrl} target="_blank" rel="noreferrer" aria-label="Open payment link" className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300">
                <ExternalLink className="h-4 w-4" />
              </a>
              <button type="button" aria-label="Copy payment link" onClick={() => void copyLink(selected.id, selected.paymentUrl)} className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300">
                {copiedId === selected.id ? <CheckCheck className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">{error}</p> : null}
        {payments.length ? (
          <div className="space-y-2">
            {payments.map((row, index) => {
              const paymentId = `${row.txHash}-${row.ts}-${index}`
              const expanded = expandedPaymentId === paymentId
              const receipt = pocketActivityReceipt(row)
              return (
                <div key={paymentId} className="rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#111216]">
                  <button type="button" aria-expanded={expanded} onClick={() => setExpandedPaymentId(current => current === paymentId ? '' : paymentId)} className="flex w-full items-center justify-between gap-3 text-left">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-gray-900 dark:text-gray-100">{view === 'collections' ? row.memo || row.payer || 'Payer' : row.payer || row.memo || 'Payer'}</span>
                      <span className="mt-0.5 block text-[11px] font-medium text-gray-400">{new Date(row.ts).toLocaleDateString()} at {new Date(row.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs font-bold tabular-nums text-gray-900 dark:text-gray-100">{displayAmount(row)}</span>
                      <span className="mt-0.5 block text-[10px] font-semibold capitalize text-gray-400">{row.paycrestStatus || 'confirmed'}</span>
                    </span>
                  </button>
                  {expanded && receipt ? <UnifiedReceipt receipt={receipt} compact className="mt-3 border-t border-gray-100 pt-3 dark:border-white/10" /> : null}
                </div>
              )
            })}
          </div>
        ) : !busy ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center dark:border-white/10 dark:bg-[#111216]">
            <p className="text-sm font-black text-gray-900 dark:text-gray-100">No payments yet</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Copy the link above when you are ready to receive.</p>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-white via-white to-slate-50 p-4 shadow-sm dark:border-white/10 dark:from-[#111216] dark:via-[#111216] dark:to-white/[0.04]">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Activity</p>
        <h2 className="mt-1 text-xl font-black tracking-tight text-gray-950 dark:text-white">{view === 'pos' ? 'POS terminals' : 'Payment requests'}</h2>
        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{view === 'pos' ? 'Each terminal keeps its own customer payment history.' : 'Shared payment links and every contribution stay together.'}</p>
      </div>
      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">{error}</p> : null}
      {resources.length ? (
        <div className="space-y-2">
          {resources.map(resource => {
            const payments = resourceRows(resource.id)
            return (
              <div key={resource.id} className="flex w-full items-center gap-2 rounded-2xl border border-gray-100 bg-white p-2 shadow-sm transition hover:border-gray-200 dark:border-white/10 dark:bg-[#111216] dark:hover:border-white/20">
                <button type="button" onClick={() => setSearchParams({ [key]: resource.id })} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 text-left">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">{view === 'pos' ? <Store className="h-4 w-4" /> : <Users className="h-4 w-4" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-gray-900 dark:text-gray-100">{resource.title}</span>
                  <span className="mt-0.5 block text-[11px] font-medium text-gray-400">{payments.length} payment{payments.length === 1 ? '' : 's'} · {totalLabel(payments)}</span>
                </span>
                </button>
                <a href={resource.paymentUrl} target="_blank" rel="noreferrer" aria-label="Open payment link" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500 dark:border-white/10 dark:text-gray-300">
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button type="button" aria-label="Copy payment link" onClick={() => void copyLink(resource.id, resource.paymentUrl)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500 dark:border-white/10 dark:text-gray-300">
                  {copiedId === resource.id ? <CheckCheck className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            )
          })}
        </div>
      ) : !busy ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center dark:border-white/10 dark:bg-[#111216]">
          <p className="text-sm font-black text-gray-900 dark:text-gray-100">No {view === 'pos' ? 'terminals' : 'payment requests'} yet</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Create one from Move and it will appear here.</p>
        </div>
      ) : null}
    </div>
  )
}
