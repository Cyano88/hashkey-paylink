/**
 * @hashpaylink/sdk — PayLinkButton
 *
 * Drop-in payment button for any React app.
 *
 * Hosted mode (default): opens the Hash PayLink checkout page in a new tab.
 * This is the zero-config, no-wallet-setup option.
 *
 * Inline mode: renders a full payment widget (requires WagmiProvider +
 * StarknetProvider in the host app — see README for setup).
 *
 * @example
 * // One-liner hosted checkout:
 * <PayLinkButton recipientEVM="0xYour..." amount="10" memo="Coffee" />
 *
 * @example
 * // Inline widget with success callback:
 * <PayLinkButton
 *   recipientEVM="0xYour..."
 *   recipientStark="0xYourStark..."
 *   amount="25"
 *   memo="Invoice #042"
 *   hosted={false}
 *   onPaymentSuccess={({ txHash, chain }) => console.log(txHash, chain)}
 * />
 */

import { ExternalLink, Zap } from 'lucide-react'
import { CHAIN_META, PLATFORM_FEE_BPS } from '../lib/chains'
import type { PayLinkButtonProps } from './types'

const HOSTED_BASE_URL = 'https://hashpaylink.com'

export function PayLinkButton({
  recipientEVM,
  recipientStark,
  amount,
  memo,
  platformFeeBps = PLATFORM_FEE_BPS,
  onPaymentSuccess: _onPaymentSuccess,
  onPaymentError: _onPaymentError,
  label,
  hosted = true,
}: PayLinkButtonProps) {
  const feePct = ((platformFeeBps / 10_000) * 100).toFixed(1)

  function buildCheckoutUrl() {
    const params = new URLSearchParams({ amt: amount })
    if (recipientEVM)   params.set('evm',   recipientEVM)
    if (recipientStark) params.set('stark', recipientStark)
    if (memo?.trim())   params.set('memo',  memo.trim())
    return `${HOSTED_BASE_URL}/pay?${params.toString()}`
  }

  if (hosted) {
    return (
      <a
        href={buildCheckoutUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-black/20"
      >
        <Zap className="h-4 w-4" />
        {label ?? `Pay ${amount} USDC`}
        <ExternalLink className="h-3.5 w-3.5 opacity-60" />
      </a>
    )
  }

  // ── Inline widget (simplified — full power requires host wagmi setup) ──────
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-md max-w-sm">
      {/* Header */}
      <div className="border-b border-gray-100 bg-gradient-to-br from-gray-50 to-white p-5 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          Payment Request
        </p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-gray-900">
          {amount} <span className="text-lg font-semibold text-gray-400">USDC · HSK</span>
        </p>
        {memo && (
          <span className="mt-2 inline-block rounded-full border border-gray-200 bg-white px-3 py-0.5 text-xs font-medium text-gray-500">
            "{memo}"
          </span>
        )}
      </div>

      {/* Chain pills */}
      <div className="flex flex-wrap justify-center gap-1 p-3">
        {(['base', 'starknet', 'hashkey', 'arc'] as const).map((c) => {
          const m = CHAIN_META[c]
          const unavailable = c === 'starknet' && !recipientStark
          return (
            <span
              key={c}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium ${unavailable ? 'text-gray-300' : m.badgeText + ' ' + m.badgeBg}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${unavailable ? 'bg-gray-300' : m.dotColor}`} />
              {m.label}
            </span>
          )
        })}
      </div>

      {/* Fee disclosure */}
      {platformFeeBps > 0 && (
        <p className="px-5 pb-1 text-center text-[10px] text-gray-400">
          Includes {feePct}% platform fee
        </p>
      )}

      {/* CTA — hosted checkout */}
      <div className="p-4">
        <a
          href={buildCheckoutUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800 transition-all active:scale-[0.98]"
        >
          <Zap className="h-4 w-4" />
          {label ?? `Pay ${amount} USDC`}
          <ExternalLink className="h-3.5 w-3.5 opacity-50" />
        </a>
        <p className="mt-2 text-center text-[10px] text-gray-400">
          Powered by Hash PayLink SDK · Non-custodial
        </p>
      </div>
    </div>
  )
}
