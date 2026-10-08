import type { PocketBankWithdrawData } from '../api/pocketBankWithdrawClient'
import type { PocketActivityRow } from '../models/pocketActivity'

/** Publish the confirmed server response before leaving the bank flow. */
export function bankPayoutActivityRow(result: PocketBankWithdrawData, payer: string, now = Date.now()): PocketActivityRow | null {
  if (!/^0x[0-9a-f]{64}$/i.test(result.txHash)) return null
  return {
    eventId: 'ngpos-' + result.merchantId, txHash: result.txHash, chain: 'base', payer: payer || 'Pocket wallet',
    assetSymbol: result.asset || 'USDC', memo: 'Direct bank payout', amount: result.amountUsdc, ts: now, source: 'bank-withdraw', direction: 'out',
    settlementType: 'instant_fiat', merchantId: result.merchantId, providerReference: result.intentId, bankOrderId: result.orderId,
    recipient: result.accountName, accountName: result.accountName, bankName: result.bankName, bankLast4: result.bankLast4,
    amountNgn: result.amountNgn, fiatCurrency: result.fiatCurrency || 'NGN', handoffVerified: result.handoffVerified,
    bankSettlementStatus: result.providerStatus, paycrestStatus: result.providerStatus || 'pending',
  }
}
