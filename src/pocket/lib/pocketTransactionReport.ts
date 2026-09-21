export const pocketReportReasons = [
  ['money_not_received', 'Money not received'],
  ['refund_missing', 'Refund not received'],
  ['incorrect_amount', 'Incorrect amount'],
  ['duplicate_payment', 'Duplicate payment'],
  ['other', 'Something else'],
] as const
export type PocketReportReason = typeof pocketReportReasons[number][0]
export type PocketReportSelector = { chain: string; eventId: string; txHash: string }
export type PocketTransactionReport = { id: string; status: 'open' | 'assigned' | 'waiting_user' | 'resolved'; summary: string }
