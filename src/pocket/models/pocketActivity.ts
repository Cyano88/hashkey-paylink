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
  direction?: 'in' | 'out'
  recipient?: string
  destination?: string
  bankName?: string
  bankLast4?: string
  accountName?: string
  providerReference?: string
  supportReference?: string
  billToken?: string
  billCategory?: 'airtime' | 'data' | 'tv' | 'electricity'
  billProvider?: string
  billTarget?: string
  billReference?: string
  refundAction?: 'claim' | 'check'
  refundTxHash?: string
}
