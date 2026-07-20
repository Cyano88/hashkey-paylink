export type PocketActivityRow = {
  eventId: string
  txHash: string
  chain: string
  payer: string
  memo: string
  amount: string
  ts: number
  source?: string
  merchantId?: string
  contextLabel?: string
  settlementType?: string
  amountNgn?: string
  paycrestStatus?: string
  activityLabel?: string
  providerReference?: string
  supportReference?: string
  refundAction?: 'claim' | 'check'
  refundTxHash?: string
}
