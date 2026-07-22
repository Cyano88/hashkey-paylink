import { useState } from 'react'
import { Activity, ArrowDownToLine, ArrowLeftRight, ArrowRight, ArrowUpFromLine, Banknote, Copy, Cpu, ExternalLink, Landmark, Mail, RefreshCw, Store } from 'lucide-react'
import { PrivyConnectButton } from '../../../lib/PrivyConnectButton'
import { cn, formatNgnAmount } from '../../../lib/utils'
import type { PocketActivityRow } from '../../models/pocketActivity'
import { formatPocketDisplayAmount } from '../../lib/pocketMoney'
import UnifiedReceipt from '../../../components/UnifiedReceipt'
import { pocketActivityReceipt, pocketActivityStatus } from '../../lib/pocketReceipt'

export type { PocketActivityRow } from '../../models/pocketActivity'

export type PocketActivityView = 'all' | 'bank' | 'pos' | 'bills' | 'app-pay'

type ActivityKind = Exclude<PocketActivityView, 'all'> | 'wallet'

type PocketActivityPanelProps = {
  view: PocketActivityView
  rows: PocketActivityRow[]
  authenticated: boolean
  busy: boolean
  error: string
  onRefresh: () => void
  onRefund: (intentId: string) => Promise<string>
}

function activityKind(row: PocketActivityRow): ActivityKind {
  const source = String(row.source ?? '').toLowerCase()
  const settlement = String(row.settlementType ?? '').toLowerCase()
  if (source === 'app-pay' || settlement === 'app_pay') return 'app-pay'
  if (source === 'wallet-deposit' || source === 'wallet-withdrawal' || source === 'wallet-bridge' || settlement === 'wallet_transfer' || settlement === 'wallet_bridge') return 'wallet'
  if (source === 'bills' || settlement === 'bill_payment') return 'bills'
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
    return source === 'app-pay'
      || settlement === 'app_pay'
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
      || settlement === 'instant_fiat'
      || settlement === 'paycrest_onramp'
      || settlement === 'bill_payment'
  })
}

export default function PocketActivityPanel({ view, rows, authenticated, busy, error, onRefresh, onRefund }: PocketActivityPanelProps) {
  const [copiedBillToken, setCopiedBillToken] = useState('')
  const [refundBusy, setRefundBusy] = useState('')
  const [refundMessage, setRefundMessage] = useState<Record<string, string>>({})
  const supported = supportedRows(rows)
  const visibleRows = view === 'all' ? supported : supported.filter(row => activityKind(row) === view)

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-white via-white to-slate-50 p-4 shadow-sm dark:border-white/10 dark:from-[#111216] dark:via-[#111216] dark:to-white/[0.04]">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Activity</p>
        <h2 className="mt-1 text-xl font-black tracking-tight text-gray-950 dark:text-white">
          {view === 'all' ? 'All activity' : view === 'bank' ? 'Bank activity' : view === 'pos' ? 'POS activity' : view === 'bills' ? 'Bills activity' : 'App Pay activity'}
        </h2>
        <p className="mt-1 max-w-sm text-xs leading-5 text-gray-500 dark:text-gray-400">
          Receipts, payouts, reversals, and support records stay connected to your Circle Pocket account.
        </p>
      </div>

      {authenticated && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 px-1">
            <p className="text-[11px] font-bold text-gray-400">
              {busy ? 'Loading activity...' : `${visibleRows.length} record${visibleRows.length === 1 ? '' : 's'}`}
            </p>
            <button
              type="button"
              onClick={onRefresh}
              disabled={busy}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:text-gray-900 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-400 dark:hover:text-white"
              aria-label="Refresh Circle Pocket activity"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
            </button>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">
              {error}
            </div>
          ) : visibleRows.length ? (
            <div className="space-y-2">
              {visibleRows.map((row, index) => {
                const kind = activityKind(row)
                const amountNgn = formatNgnAmount(row.amountNgn ?? '')
                const amountUsdc = Number.parseFloat(row.amount || '')
                const timestamp = row.ts ? new Date(row.ts) : null
                const refundIntentId = kind === 'bills' ? row.merchantId || '' : ''
                const claimingRefund = refundBusy === refundIntentId
                const receipt = pocketActivityReceipt(row)
                return (
                  <div key={`${row.txHash || row.eventId}-${row.ts}-${index}`} className="rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#111216]">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                          {kind === 'wallet'
                            ? String(row.source).toLowerCase() === 'wallet-deposit' ? <ArrowDownToLine className="h-4 w-4" /> : String(row.source).toLowerCase() === 'wallet-bridge' ? <ArrowLeftRight className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />
                            : kind === 'bank' ? <Landmark className="h-4 w-4" /> : kind === 'bills' ? <Banknote className="h-4 w-4" /> : kind === 'app-pay' ? <Cpu className="h-4 w-4" /> : <Store className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-gray-900 dark:text-gray-100">
                            {row.activityLabel || (kind === 'wallet' ? (String(row.source).toLowerCase() === 'wallet-deposit' ? 'USDC deposit' : String(row.source).toLowerCase() === 'wallet-bridge' ? 'USDC bridge' : 'USDC sent') : kind === 'bank' ? (String(row.source).toLowerCase().includes('withdraw') ? 'Bank payout' : 'Bank receive') : kind === 'bills' ? 'Bill payment' : kind === 'app-pay' ? 'App Pay service' : 'POS payment')}
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
                      </span>
                    </div>
                    {timestamp && (
                      <p className="mt-3 border-t border-gray-100 pt-2 text-[10px] font-medium text-gray-400 dark:border-white/10">
                        {timestamp.toLocaleDateString()} at {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                    {receipt && (
                      <div className="mt-2 space-y-3">
                        <UnifiedReceipt receipt={receipt} />
                            {row.billToken && (() => {
                              const token = row.billToken.replace(/^token\s*:\s*/i, '').trim()
                              return (
                                <div className="rounded-xl bg-emerald-50 px-3 py-2.5 dark:bg-emerald-400/10">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">Recharge token</span>
                                    <button type="button" onClick={() => void navigator.clipboard.writeText(token).then(() => setCopiedBillToken(row.eventId)).catch(() => undefined)} className="flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-200"><Copy className="h-3 w-3" />{copiedBillToken === row.eventId ? 'Copied' : 'Copy'}</button>
                                  </div>
                                  <span className="mt-1.5 block select-all break-all font-mono text-xs font-black tracking-[0.08em] text-emerald-950 dark:text-emerald-100">{token}</span>
                                </div>
                              )
                            })()}
                            {row.supportReference && (
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
                                  {claimingRefund && <RefreshCw className="h-3 w-3 animate-spin" />}
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
              })}
            </div>
          ) : !busy ? (
            <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-5 text-center shadow-sm dark:border-white/10 dark:bg-[#111216]">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-300">
                <Activity className="h-[18px] w-[18px]" />
              </span>
              <h3 className="mt-3 text-sm font-black text-gray-900 dark:text-gray-100">No activity to show yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-gray-500 dark:text-gray-400">
                {view === 'all' ? 'USDC deposits and sends, App Pay, bank receive, POS, and bill records will appear here.' : `Your ${view === 'bank' ? 'bank receive' : view === 'app-pay' ? 'App Pay' : view.toUpperCase()} records will appear here.`}
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
