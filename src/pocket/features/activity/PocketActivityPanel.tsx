import { useState } from 'react'
import { Activity, ArrowDownToLine, ArrowLeftRight, ArrowRight, ArrowUpFromLine, Banknote, Check, ChevronDown, Copy, Filter, Landmark, Loader2, Mail, Store, Wallet } from '../../components/PocketIcons'
import { ArrowTopRightOnSquareIcon as ExternalLink } from '@heroicons/react/24/outline'
import { PrivyConnectButton } from '../../../lib/PrivyConnectButton'
import { cn, formatNgnAmount } from '../../../lib/utils'
import type { PocketActivityRow } from '../../models/pocketActivity'
import { formatPocketDisplayAmount } from '../../lib/pocketMoney'
import UnifiedReceipt from '../../../components/UnifiedReceipt'
import { pocketActivityReceipt, pocketActivityStatus } from '../../lib/pocketReceipt'

export type { PocketActivityRow } from '../../models/pocketActivity'

export type PocketActivityView = 'all' | 'purchases' | 'bank' | 'pos' | 'collections'

type ActivityKind = 'bank' | 'pos' | 'purchases' | 'collections' | 'wallet'

type PocketActivityPanelProps = {
  view: PocketActivityView
  rows: PocketActivityRow[]
  authenticated: boolean
  busy: boolean
  error: string
  onRefund: (intentId: string) => Promise<string>
}

function activityKind(row: PocketActivityRow): ActivityKind {
  const source = String(row.source ?? '').toLowerCase()
  const settlement = String(row.settlementType ?? '').toLowerCase()
  if (source === 'collection' || source === 'request') return 'collections'
  if (source === 'wallet-deposit' || source === 'wallet-withdrawal' || source === 'wallet-bridge' || settlement === 'wallet_transfer' || settlement === 'wallet_bridge') return 'wallet'
  if (source === 'purchase' || source === 'bills' || settlement === 'bill_payment' || settlement === 'hosted_checkout' || settlement === 'service_funding') return 'purchases'
  if (source === 'bank-send' || source === 'bank_send' || settlement === 'paycrest_onramp') return 'bank'
  if (source === 'bank-receive' || source === 'bank_receive' || source === 'bank-withdraw' || source === 'bank_withdraw') return 'bank'
  if (source === 'ngpos' || source === 'pos') return 'pos'
  if (settlement === 'instant_fiat') return 'bank'
  return 'pos'
}

function supportedRows(rows: PocketActivityRow[]) {
  return rows.filter(row => {
    const source = String(row.source ?? '').toLowerCase()
    const settlement = String(row.settlementType ?? '').toLowerCase()
    return source === 'collection'
      || source === 'request'
      || source === 'wallet-deposit'
      || source === 'wallet-withdrawal'
      || source === 'wallet-bridge'
      || settlement === 'wallet_transfer'
      || settlement === 'wallet_bridge'
      || source === 'ngpos'
      || source === 'pos'
      || source === 'bank-receive'
      || source === 'bank_receive'
      || source === 'bank-withdraw'
      || source === 'bank_withdraw'
      || source === 'bank-send'
      || source === 'bank_send'
      || source === 'bills'
      || source === 'purchase'
      || settlement === 'instant_fiat'
      || settlement === 'paycrest_onramp'
      || settlement === 'bill_payment'
      || settlement === 'hosted_checkout'
      || settlement === 'service_funding'
  })
}

function activityMonth(row: PocketActivityRow) {
  const date = new Date(row.ts)
  return Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : 'unknown'
}

function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number)
  return Number.isFinite(year) && Number.isFinite(month)
    ? new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : 'Earlier activity'
}

export default function PocketActivityPanel({ view, rows, authenticated, busy, error, onRefund }: PocketActivityPanelProps) {
  const [expandedActivityId, setExpandedActivityId] = useState('')
  const [refundBusy, setRefundBusy] = useState('')
  const [refundMessage, setRefundMessage] = useState<Record<string, string>>({})
  const [copiedReference, setCopiedReference] = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const supported = supportedRows(rows).filter(row => (
    activityKind(row) !== 'bank'
    || pocketActivityStatus(row) !== 'status unavailable'
  ))
  const visibleRows = (view === 'all' ? supported : supported.filter(row => activityKind(row) === view))
    .slice()
    .sort((a, b) => b.ts - a.ts)
  const months = [...new Set(visibleRows.map(activityMonth))]
  const filteredRows = monthFilter ? visibleRows.filter(row => activityMonth(row) === monthFilter) : visibleRows
  const monthGroups = [...new Set(filteredRows.map(activityMonth))].map(month => ({ month, rows: filteredRows.filter(row => activityMonth(row) === month) }))

  return (
    <div className="space-y-5">
      {authenticated && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] font-bold text-gray-400">
              {busy && !filteredRows.length
                ? 'Loading activity...'
                : error && !filteredRows.length
                  ? 'Activity could not refresh'
                  : `${filteredRows.length} record${filteredRows.length === 1 ? '' : 's'}`}
            </p>
            {!!visibleRows.length && <button type="button" onClick={() => setFilterOpen(current => !current)} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]" aria-label="Filter activity by month" aria-expanded={filterOpen}><Filter className="h-4 w-4" /></button>}
          </div>

          {filterOpen && <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#111216]"><label className="text-[10px] font-bold uppercase tracking-wider text-gray-400" htmlFor="pocket-activity-month">Month and year</label><select id="pocket-activity-month" value={monthFilter} onChange={event => { setMonthFilter(event.target.value); setFilterOpen(false) }} className="mt-2 min-h-11 w-full rounded-xl bg-gray-50 px-3 text-xs font-semibold outline-none dark:bg-white/[0.06]"><option value="">All history</option>{months.map(month => <option key={month} value={month}>{monthLabel(month)}</option>)}</select></div>}

          {error && !visibleRows.length ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">
              {error}
            </div>
          ) : filteredRows.length ? (
            <div className="space-y-5">
              {monthGroups.map(group => <section key={group.month}>
                <p className="px-1 text-[11px] font-bold text-gray-500 dark:text-gray-400">{monthLabel(group.month)}</p>
                <div className="mt-2 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-[#111216]">
              {group.rows.map((row, index) => {
                const kind = activityKind(row)
                const amountNgn = formatNgnAmount(row.amountNgn ?? '')
                const amountUsdc = Number.parseFloat(row.amount || '')
                const timestamp = row.ts ? new Date(row.ts) : null
                const refundIntentId = row.source === 'bills' ? row.merchantId || '' : ''
                const claimingRefund = refundBusy === refundIntentId
                const receipt = pocketActivityReceipt(row)
                const recordId = `${row.txHash || row.eventId}-${row.ts}-${index}`
                const collapsible = Boolean(receipt)
                const expanded = collapsible && expandedActivityId === recordId
                const supportReference = row.supportReference || row.providerReference || row.billReference || row.receiptId || row.txHash || row.eventId
                return (
                  <div key={recordId} className="border-b border-gray-100 p-3.5 last:border-0 dark:border-white/10">
                    <div
                      className={cn('flex items-start justify-between gap-3', collapsible && 'cursor-pointer')}
                      role={collapsible ? 'button' : undefined}
                      tabIndex={collapsible ? 0 : undefined}
                      aria-expanded={collapsible ? expanded : undefined}
                      onClick={() => { if (collapsible) setExpandedActivityId(current => current === recordId ? '' : recordId) }}
                      onKeyDown={event => {
                        if (!collapsible || (event.key !== 'Enter' && event.key !== ' ')) return
                        event.preventDefault()
                        setExpandedActivityId(current => current === recordId ? '' : recordId)
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                          {kind === 'wallet'
                            ? String(row.source).toLowerCase() === 'wallet-deposit' ? <ArrowDownToLine className="h-4 w-4" /> : String(row.source).toLowerCase() === 'wallet-bridge' ? <ArrowLeftRight className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />
                            : String(row.source).toLowerCase() === 'request' ? row.direction === 'in' ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />
                            : kind === 'bank' ? ['refunded', 'reversed'].includes(String(row.paycrestStatus ?? '').toLowerCase()) || row.refundTxHash ? <ArrowDownToLine className="h-4 w-4" /> : <Landmark className="h-4 w-4" /> : kind === 'purchases' ? row.source === 'bills' ? <Banknote className="h-4 w-4" /> : <Wallet className="h-4 w-4" /> : <Store className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-gray-900 dark:text-gray-100">
                            {row.activityLabel || (kind === 'wallet' ? (String(row.source).toLowerCase() === 'wallet-deposit' ? 'USDC deposit' : String(row.source).toLowerCase() === 'wallet-bridge' ? 'USDC bridge' : 'USDC sent') : kind === 'bank' ? (String(row.source).toLowerCase().includes('withdraw') ? 'Bank payout' : 'Bank receive') : kind === 'purchases' ? 'Purchase' : 'POS payment')}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] font-medium text-gray-400">
                            {row.contextLabel || row.memo || row.payer || 'Circle Pocket receipt'}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-xs font-semibold tabular-nums tracking-[-0.02em] text-gray-900 dark:text-gray-100">
                          {amountNgn ? `NGN ${amountNgn}` : Number.isFinite(amountUsdc) ? `${formatPocketDisplayAmount(amountUsdc)} USDC` : 'Receipt'}
                        </span>
                        <span className="mt-0.5 block text-[10px] font-semibold capitalize text-gray-400">{pocketActivityStatus(row)}</span>
                        {supportReference && <button type="button" onClick={event => { event.stopPropagation(); void navigator.clipboard.writeText(supportReference).then(() => { setCopiedReference(recordId); window.setTimeout(() => setCopiedReference(''), 1200) }) }} className="ml-auto mt-1 inline-flex items-center gap-1 font-mono text-[9px] font-semibold text-gray-400" aria-label="Copy full support reference">{supportReference.length > 10 ? `${supportReference.slice(0, 3)}…${supportReference.slice(-3)}` : supportReference}{copiedReference === recordId ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}</button>}
                        {collapsible && <ChevronDown className={cn('ml-auto mt-1 h-3.5 w-3.5 text-gray-300 transition-transform', expanded && 'rotate-180')} />}
                      </span>
                    </div>
                    {timestamp && expanded && (
                      <p className="mt-3 border-t border-gray-100 pt-2 text-[10px] font-medium text-gray-400 dark:border-white/10">
                        {timestamp.toLocaleDateString()} at {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                    {receipt && expanded && (
                      <div className="mt-2 space-y-3">
                        <UnifiedReceipt receipt={receipt} />
                            {row.supportReference && row.source !== 'bills' && (
                              <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2.5 text-[10px] dark:border-white/10">
                                <span className="font-semibold text-gray-400">Support reference</span>
                                <span className="max-w-[60%] break-all text-right font-mono text-gray-500 dark:text-gray-300">{row.supportReference}</span>
                              </div>
                            )}
                            {row.refundTxHash && (
                              <div className="flex items-start justify-between gap-3">
                                <span className="font-semibold text-gray-400">Refund transaction</span>
                                <a href={`https://base.blockscout.com/tx/${row.refundTxHash}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-mono font-semibold text-blue-600 hover:underline dark:text-blue-300">
                                  {row.refundTxHash.slice(0, 8)}...{row.refundTxHash.slice(-6)}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                            )}
                            {row.refundAction && refundIntentId && (
                              <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-2 dark:border-white/10">
                                <span className="font-semibold text-gray-400">USDC refund</span>
                                <button
                                  type="button"
                                  disabled={claimingRefund}
                                  onClick={async () => {
                                    setRefundBusy(refundIntentId)
                                    setRefundMessage(current => ({ ...current, [refundIntentId]: '' }))
                                    try {
                                      const state = await onRefund(refundIntentId)
                                      setRefundMessage(current => ({ ...current, [refundIntentId]: state === 'refunded' ? 'Refunded' : 'Refund submitted' }))
                                    } catch (reason) {
                                      setRefundMessage(current => ({ ...current, [refundIntentId]: reason instanceof Error ? reason.message : 'Refund status is unavailable.' }))
                                    } finally {
                                      setRefundBusy('')
                                    }
                                  }}
                                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full bg-gray-950 px-3 text-[10px] font-bold text-white transition hover:bg-black active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"
                                >
                                  {claimingRefund && <Loader2 className="h-3 w-3 animate-spin" />}
                                  {claimingRefund ? 'Refunding' : row.refundAction === 'claim' ? 'Claim refund' : 'Check refund'}
                                </button>
                              </div>
                            )}
                            {refundIntentId && refundMessage[refundIntentId] && (
                              <p className="text-right text-[10px] font-semibold text-gray-500 dark:text-gray-300">{refundMessage[refundIntentId]}</p>
                            )}
                      </div>
                    )}
                  </div>
                )
              })}</div></section>)}
            </div>
          ) : !busy ? (
            <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-5 text-center shadow-sm dark:border-white/10 dark:bg-[#111216]">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-300">
                <Activity className="h-[18px] w-[18px]" />
              </span>
              <h3 className="mt-3 text-sm font-black text-gray-900 dark:text-gray-100">No activity to show yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-gray-500 dark:text-gray-400">
                {view === 'all' ? 'Purchases, USDC, bank, POS, and request records will appear here.' : `Your ${view === 'bank' ? 'bank receive' : view} records will appear here.`}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {!authenticated && (
        <div className="overflow-hidden rounded-[26px] border border-gray-200 bg-[#F5F5F7]/95 p-2 shadow-[0_12px_36px_rgba(15,23,42,0.1)] dark:border-white/10 dark:bg-[#151518]/95 dark:shadow-[0_16px_44px_rgba(0,0,0,0.3)]">
          <PrivyConnectButton className="group relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 py-1.5 text-center text-sm font-semibold text-white shadow-sm transition-all hover:bg-black active:scale-[0.98] disabled:opacity-60 dark:bg-white/[0.12] dark:text-white dark:hover:bg-white/[0.16]">
            <Mail className="absolute left-5 h-4 w-4" />
            <span>Sign in to Activity</span>
            <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition-transform group-hover:translate-x-0.5">
              <ArrowRight className="h-4 w-4" />
            </span>
          </PrivyConnectButton>
          <p className="px-3 pb-1 pt-2 text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
            Secure access keeps activity history, receipts, reversals, and support records connected.
          </p>
        </div>
      )}
    </div>
  )
}
