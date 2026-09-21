/** Bank settlement status. A funding transaction hash alone is not a payout outcome. */
export function pocketBankStatus(value: unknown, source = 'bank-withdraw') {
  const status = String(value || '').trim().toLowerCase().replace(/_/g, ' ')
  if (['refunded', 'reversed'].includes(status)) return 'reversed'
  if (['refunding', 'reversing'].includes(status)) return 'reversing'
  if (['failed', 'rejected', 'cancelled', 'canceled', 'expired', 'reverted'].includes(status)) return 'failed'
  if (['settled', 'completed', 'successful', 'success'].includes(status)) return 'successful'
  if (source !== 'bank-withdraw' && ['validated', 'confirmed', 'paid'].includes(status)) return 'successful'
  return 'pending'
}
