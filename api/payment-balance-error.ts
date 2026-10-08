import { formatUnits } from 'viem'
import { paymentFeeBreakdown } from '../src/lib/platformFees.js'

/** Return the exact authenticated quote breakdown; never guess a gas charge. */
export function paymentBalanceError(available: bigint, amount: bigint, networkFee: bigint, mode: 'gross' | 'net', exempt = false, asset: 'USDC' | 'USDT' = 'USDC') {
  const fees = paymentFeeBreakdown(amount, networkFee, mode, exempt)
  if (available >= fees.total) return null
  const shortfall = formatUnits(((fees.total - available + 9_999n) / 10_000n) * 10_000n, 6)
  return {
    ok: false, code: 'INSUFFICIENT_PAYMENT_BALANCE',
    error: `Add ${shortfall} ${asset} to cover this send and fees.`,
    feeDetails: { availableUnits: available.toString(), recipientUnits: fees.recipient.toString(), networkFeeUnits: fees.networkFee.toString(), platformFeeUnits: fees.platformFee.toString(), totalUnits: fees.total.toString() },
  }
}
