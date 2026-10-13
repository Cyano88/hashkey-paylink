import { formatUnits, parseUnits } from 'viem'
import { verifyPaymentFeeQuote } from '../payment-fee-quotes.js'
import type { EsimIntent } from './esim-orders.js'

export function verifyEsimFee(item: EsimIntent, walletId: string, token: string, now = Date.now(), secret?: string) {
  const quote = verifyPaymentFeeQuote(token, { purpose: 'wallet-send', asset: item.asset, chain: 'base',
    walletId, walletAddress: item.payer, recipient: item.treasury, amountUnits: parseUnits(item.price.total, 6).toString(), mode: 'gross' }, now, secret)
  // The service price already includes the 0.25% fee. The transfer quote adds only network reimbursement.
  if (quote.platformFeeUnits !== '0' || quote.recipientUnits !== parseUnits(item.price.total, 6).toString()) throw Error('ESIM_INVALID_PAYMENT')
  return { networkFee: formatUnits(BigInt(quote.networkFeeUnits), 6), totalDebit: formatUnits(BigInt(quote.totalUnits), 6), token, expiresAt: quote.expiresAt }
}
