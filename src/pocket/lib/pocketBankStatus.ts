/** Bank settlement status. A funding transaction hash alone is not a payout outcome. */
export function pocketBankStatus(value: unknown, source = 'bank-withdraw', hasFundingHash = false, handoffVerified = false) {
  const status = String(value || '').trim().toLowerCase().replace(/_/g, ' ')
  if (['refunded', 'reversed'].includes(status)) return 'reversed'
  if (['refunding', 'reversing'].includes(status)) return 'reversing'
  if (status === 'expired' && source === 'bank-withdraw' && hasFundingHash) return 'payout incomplete'
  if (['failed', 'rejected', 'cancelled', 'canceled', 'expired', 'reverted'].includes(status)) return 'failed'
  if (['settled', 'completed', 'successful', 'success'].includes(status)) return 'successful'
  if (source !== 'bank-withdraw' && ['validated', 'confirmed', 'paid'].includes(status)) return 'successful'
  if (source === 'bank-withdraw' && handoffVerified && hasFundingHash && ['created','initiated','reconciling','pending','processing','submitted','deposited','fulfilling','fulfilled','validated','settling'].includes(status)) return 'successful'
  if (['pending','processing','submitted','deposited','fulfilling','fulfilled','validated','settling','initiated','created','reconciling'].includes(status)) return 'pending'
  return 'payout incomplete'
}
