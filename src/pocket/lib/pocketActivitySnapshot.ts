import type { PocketActivityReadData, PocketActivityRow } from './pocketSchemas'

const transactionKey = (row: PocketActivityRow) => JSON.stringify([
  row.chain.toLowerCase(), /^0x/i.test(row.txHash) ? row.txHash.toLowerCase() : row.txHash,
])
const isBank = (row:PocketActivityRow) => String(row.source || '').replace(/_/g,'-').startsWith('bank-')
const rowKey = (row: PocketActivityRow) => isBank(row) && (row.bankOrderId || row.providerReference)
  ? JSON.stringify([row.chain.toLowerCase(),row.bankOrderId || row.providerReference,row.source]) : JSON.stringify([
  row.providerReference ? row.chain + ':' + row.providerReference : transactionKey(row), row.source || '', row.direction || '', row.eventId,
])

/** Merge observed history. Absence from a bounded/provider response is not deletion. */
export function mergePocketActivityRows(previous: PocketActivityRow[], incoming: PocketActivityRow[]) {
  const rows = new Map(previous.map(row => [rowKey(row), row]))
  for (const row of incoming) {
    let old = rows.get(rowKey(row))
    for (const [key,candidate] of rows) {
      const sameHash = transactionKey(candidate) === transactionKey(row) && candidate.source === row.source && candidate.eventId === row.eventId
      const references=[row.bankOrderId,row.providerReference].filter(Boolean)
      const sameReference=references.some(reference=>reference===candidate.bankOrderId||reference===candidate.providerReference)
      const compatibleReference = !candidate.providerReference || !row.providerReference || sameReference
      const alias = sameHash && compatibleReference && (candidate.direction === row.direction || isBank(row) && (!candidate.direction || !row.direction))
      const sameOrder = isBank(row) && isBank(candidate) && sameReference && candidate.chain.toLowerCase() === row.chain.toLowerCase() && candidate.source === row.source
      if(alias || sameOrder){if(!old || candidate.ts<old.ts)old=candidate;rows.delete(key)}
    }
    // The current source owns mutable fields, including removal of refund actions.
    const bank = String(row.source || '').replace(/_/g, '-').startsWith('bank-')
      || row.settlementType?.toLowerCase() === 'instant_fiat'
    // A partial bank response is not evidence that a previously observed status vanished.
    const savedStatus = bank && !row.paycrestStatus?.trim() && old?.paycrestStatus
      ? { paycrestStatus: old.paycrestStatus } : {}
    const receiptIdentity=bank && old?.eventId.startsWith('ngpos-') && !row.eventId.startsWith('ngpos-') ? {eventId:old.eventId,txHash:old.txHash} : {}
    rows.set(rowKey(row), { ...row, ...savedStatus, ...receiptIdentity, ...(bank && row.handoffVerified === undefined && old?.handoffVerified ? {handoffVerified:true} : {}), ...(bank && !row.bankSettlementStatus && !row.paycrestStatus?.trim() && old?.bankSettlementStatus ? {bankSettlementStatus:old.bankSettlementStatus} : {}), ts: old?.ts || row.ts })
  }
  const values = [...rows.values()]
  const contextual = new Set(values.filter(row => row.source && !['wallet-deposit', 'wallet-withdrawal'].includes(row.source)).map(row => transactionKey(row) + ':' + (row.direction || 'in')))
  return values.filter(row => !['wallet-deposit', 'wallet-withdrawal'].includes(row.source || '')
    || !contextual.has(transactionKey(row) + ':' + (row.direction || 'in')))
    .sort((a, b) => b.ts - a.ts || rowKey(a).localeCompare(rowKey(b)))
}

export function mergePocketActivitySnapshot(previous: PocketActivityReadData | undefined, incoming: PocketActivityReadData): PocketActivityReadData {
  return {
    ...incoming,
    payments: mergePocketActivityRows(previous?.payments ?? [], incoming.payments),
    merchants: [...new Map([...(previous?.merchants ?? []), ...incoming.merchants].map(row => [row.merchant_id, row])).values()],
    collections: [...new Map([...(previous?.collections ?? []), ...incoming.collections].map(row => [row.eventId, row])).values()],
  }
}
