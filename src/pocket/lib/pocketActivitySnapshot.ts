import type { PocketActivityReadData, PocketActivityRow } from './pocketSchemas'

const transactionKey = (row: PocketActivityRow) => JSON.stringify([
  row.chain.toLowerCase(), /^0x/i.test(row.txHash) ? row.txHash.toLowerCase() : row.txHash,
])
const rowKey = (row: PocketActivityRow) => JSON.stringify([
  row.providerReference ? row.chain + ':' + row.providerReference : transactionKey(row), row.source || '', row.direction || '', row.eventId,
])

/** Merge observed history. Absence from a bounded/provider response is not deletion. */
export function mergePocketActivityRows(previous: PocketActivityRow[], incoming: PocketActivityRow[]) {
  const rows = new Map(previous.map(row => [rowKey(row), row]))
  for (const row of incoming) {
    let old = rows.get(rowKey(row))
    if (!old) {
      const alias = [...rows.entries()].find(([, candidate]) => transactionKey(candidate) === transactionKey(row)
        && candidate.source === row.source && candidate.direction === row.direction && candidate.eventId === row.eventId)
      if (alias) { old = alias[1]; rows.delete(alias[0]) }
    }
    // The current source owns mutable fields, including removal of refund actions.
    rows.set(rowKey(row), { ...row, ts: old?.ts || row.ts })
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
