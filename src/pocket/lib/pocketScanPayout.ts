type ScanPayoutOrder = {
  intent_id: string
  paycrest_order_id: string
  receive_address: string
  amount_usdc: string
  amount_ngn: string
  status: string
  tx_hash?: string
  valid_until?: string
  bank_name?: string
  bank_last4?: string
  bank_account_name?: string
}

export function assertPocketScanPayoutPayable(order: ScanPayoutOrder, now = Date.now()) {
  if (order.tx_hash || order.status.toLowerCase() !== 'initiated') {
    throw new Error('This payout is already submitted or closed. Check its status before paying again.')
  }
  const expires = Date.parse(order.valid_until || '')
  if (!Number.isFinite(expires) || expires <= now + 30_000) {
    throw new Error('This payout quote expired. Review a fresh quote before paying.')
  }
}

export function pocketScanPayoutNeedsReview(previous: ScanPayoutOrder | null, next: ScanPayoutOrder) {
  if (!previous) return true
  return (['intent_id', 'paycrest_order_id', 'receive_address', 'amount_usdc', 'amount_ngn', 'bank_name', 'bank_last4', 'bank_account_name'] as const)
    .some(key => previous[key] !== next[key])
}
