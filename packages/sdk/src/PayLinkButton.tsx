import { ExternalLink, Zap } from 'lucide-react'
import { CHAIN_META, PLATFORM_FEE_BPS } from './chains'
import type { PayLinkButtonProps } from './types'

const HOSTED_BASE_URL = 'https://hash-paylink.vercel.app'

export function PayLinkButton({
  recipientEVM,
  recipientStark,
  amount,
  memo,
  platformFeeBps = PLATFORM_FEE_BPS,
  onPaymentSuccess: _onSuccess,
  onPaymentError: _onError,
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

  // ── Hosted mode: pure anchor, zero wallet setup required ──────────────────
  if (hosted) {
    return (
      <a
        href={buildCheckoutUrl()}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          borderRadius: '12px', background: '#000', padding: '12px 20px',
          fontSize: '14px', fontWeight: 600, color: '#fff', textDecoration: 'none',
          transition: 'background 0.15s',
        }}
      >
        <Zap size={16} />
        {label ?? `Pay ${amount} USDC`}
        <ExternalLink size={14} style={{ opacity: 0.6 }} />
      </a>
    )
  }

  // ── Inline widget ─────────────────────────────────────────────────────────
  return (
    <div style={{
      overflow: 'hidden', borderRadius: '16px', border: '1px solid #e5e7eb',
      background: '#fff', boxShadow: '0 4px 24px -4px rgba(0,0,0,0.08)',
      maxWidth: '360px', fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', padding: '20px', textAlign: 'center' }}>
        <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af', margin: '0 0 4px' }}>
          Payment Request
        </p>
        <p style={{ fontSize: '28px', fontWeight: 700, color: '#111', margin: 0 }}>
          {amount} <span style={{ fontSize: '16px', fontWeight: 600, color: '#9ca3af' }}>USDC · HSK</span>
        </p>
        {memo && (
          <span style={{ display: 'inline-block', marginTop: '8px', borderRadius: '999px', border: '1px solid #e5e7eb', background: '#fff', padding: '2px 12px', fontSize: '12px', color: '#6b7280' }}>
            "{memo}"
          </span>
        )}
      </div>

      {/* Chain pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px', padding: '12px' }}>
        {(['base', 'starknet', 'hashkey', 'arc'] as const).map((c) => {
          const m = CHAIN_META[c]
          const unavailable = c === 'starknet' && !recipientStark
          return (
            <span key={c} style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              borderRadius: '8px', padding: '4px 10px', fontSize: '12px', fontWeight: 500,
              background: unavailable ? '#f3f4f6' : '#f5f3ff',
              color: unavailable ? '#d1d5db' : m.accentColor,
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: unavailable ? '#d1d5db' : m.accentColor, display: 'inline-block' }} />
              {m.label}
            </span>
          )
        })}
      </div>

      {/* Fee */}
      {platformFeeBps > 0 && (
        <p style={{ textAlign: 'center', fontSize: '11px', color: '#9ca3af', margin: '0 0 4px' }}>
          Includes {feePct}% platform fee
        </p>
      )}

      {/* CTA */}
      <div style={{ padding: '12px 16px 16px' }}>
        <a
          href={buildCheckoutUrl()}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center',
            gap: '8px', borderRadius: '12px', background: '#000', padding: '12px 20px',
            fontSize: '14px', fontWeight: 600, color: '#fff', textDecoration: 'none',
            boxSizing: 'border-box',
          }}
        >
          <Zap size={16} />
          {label ?? `Pay ${amount} USDC`}
          <ExternalLink size={14} style={{ opacity: 0.5 }} />
        </a>
        <p style={{ textAlign: 'center', fontSize: '10px', color: '#9ca3af', margin: '8px 0 0' }}>
          Powered by Hash PayLink SDK · Non-custodial
        </p>
      </div>
    </div>
  )
}
