import { ExternalLink, Zap } from 'lucide-react'
import { CHAIN_META, PLATFORM_FEE_BPS } from './chains'
import type { PayLinkButtonProps } from './types'
import { buildPayLinkUrl } from './url'

export function PayLinkButton({
  recipientEVM,
  recipientSolana,
  recipientStark,
  amount,
  flexibleAmount,
  memo,
  network = 'base',
  multiChain,
  eventId,
  source,
  mode = 'wallet',
  baseUrl,
  platformFeeBps = PLATFORM_FEE_BPS,
  onPaymentSuccess: _onSuccess,
  onPaymentError: _onError,
  label,
  hosted = true,
}: PayLinkButtonProps) {
  const checkoutUrl = buildPayLinkUrl({
    baseUrl,
    network,
    recipientEVM,
    recipientSolana,
    recipientStark,
    amount,
    flexibleAmount,
    memo,
    multiChain,
    eventId,
    source,
    mode,
  })
  const meta = CHAIN_META[network]
  const displayAmount = flexibleAmount ? 'USDC' : `${amount} ${meta.asset}`
  const feePct = ((platformFeeBps / 10_000) * 100).toFixed(1)
  const buttonLabel = label ?? (flexibleAmount ? 'Pay with Hash PayLink' : `Pay ${displayAmount}`)

  if (hosted) {
    return (
      <a
        href={checkoutUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          borderRadius: 12,
          background: '#000',
          padding: '12px 18px',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 14,
          fontWeight: 700,
          color: '#fff',
          textDecoration: 'none',
        }}
      >
        <Zap size={16} />
        {buttonLabel}
        <ExternalLink size={14} style={{ opacity: 0.65 }} />
      </a>
    )
  }

  return (
    <div style={{
      overflow: 'hidden',
      borderRadius: 14,
      border: '1px solid #e5e7eb',
      background: '#fff',
      boxShadow: '0 10px 30px -18px rgba(0,0,0,0.35)',
      maxWidth: 360,
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ borderBottom: '1px solid #eef0f3', padding: 18 }}>
        <p style={{ margin: 0, color: '#6b7280', fontSize: 12, fontWeight: 700 }}>
          Hash PayLink
        </p>
        <p style={{ margin: '6px 0 0', color: '#111827', fontSize: 28, fontWeight: 800 }}>
          {displayAmount}
        </p>
        {memo?.trim() && (
          <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 13 }}>
            {memo.trim()}
          </p>
        )}
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {Object.values(CHAIN_META)
            .filter((chain) => multiChain || chain.key === network)
            .map((chain) => (
              <span key={chain.key} style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                borderRadius: 8,
                background: '#f9fafb',
                border: '1px solid #eef0f3',
                padding: '5px 8px',
                color: chain.accentColor,
                fontSize: 12,
                fontWeight: 700,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: chain.accentColor }} />
                {chain.label}
              </span>
            ))}
        </div>
        {platformFeeBps > 0 && (
          <p style={{ margin: '0 0 12px', color: '#9ca3af', fontSize: 11 }}>
            Includes {feePct}% transparent platform fee.
          </p>
        )}
        <a
          href={checkoutUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            width: '100%',
            boxSizing: 'border-box',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderRadius: 12,
            background: '#000',
            padding: '12px 16px',
            color: '#fff',
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          <Zap size={16} />
          {buttonLabel}
          <ExternalLink size={14} style={{ opacity: 0.65 }} />
        </a>
      </div>
    </div>
  )
}
