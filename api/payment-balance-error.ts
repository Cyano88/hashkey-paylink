import { formatUnits } from 'viem'
import { paymentFeeBreakdown } from '../src/lib/platformFees.js'

/** Return the exact authenticated quote breakdown; never guess a gas charge. */
export function paymentBalanceError(available: bigint, amount: bigint, networkFee: bigint, mode: 'gross' | 'net', exempt = false) {
  const fees = paymentFeeBreakdown(amount, networkFee, mode, exempt)
  if (available >= fees.total) return null
  const usdc = (units: bigint) => formatUnits(units, 6)
  return {
    ok: false, code: 'INSUFFICIENT_PAYMENT_BALANCE',
    error: `This send needs ${usdc(fees.total)} USDC (${usdc(fees.recipient)} to recipient + ${usdc(fees.networkFee)} network + ${usdc(fees.platformFee)} platform). Available: ${usdc(available)} USDC.`,
    feeDetails: { availableUnits: available.toString(), recipientUnits: fees.recipient.toString(), networkFeeUnits: fees.networkFee.toString(), platformFeeUnits: fees.platformFee.toString(), totalUnits: fees.total.toString() },
  }
}
