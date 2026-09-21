import type { PocketActivityRow } from '../models/pocketActivity'
export function pocketActivityArchiveKey(row:PocketActivityRow) {
  const order=row.bankOrderId || row.providerReference
  return row.source?.replace(/_/g,'-').startsWith('bank-') && order
    ? `bank:${row.chain.toLowerCase()}:${order}` : `${row.chain.toLowerCase()}:${row.eventId}:${row.txHash}`
}
