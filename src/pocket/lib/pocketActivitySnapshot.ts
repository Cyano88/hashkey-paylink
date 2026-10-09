import { EVM_PLATFORM_TREASURY } from '../../lib/platformFees'
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
      const sameBill = row.source === 'bills' && candidate.source === 'bills' && row.chain === candidate.chain && row.eventId === candidate.eventId
      if(alias || sameOrder || sameBill){if(!old || candidate.ts<old.ts)old=candidate;rows.delete(key)}
    }
    if (row.fundingOnly && old && !old.fundingOnly) { rows.set(rowKey(old), {...old,paymentFunding:row.paymentFunding || old.paymentFunding}); continue }
    // The current source owns mutable fields, including removal of refund actions.
    const bank = String(row.source || '').replace(/_/g, '-').startsWith('bank-')
      || row.settlementType?.toLowerCase() === 'instant_fiat'
    // A partial bank response is not evidence that a previously observed status vanished.
    const savedStatus = bank && !row.paycrestStatus?.trim() && old?.paycrestStatus
      ? { paycrestStatus: old.paycrestStatus } : {}
    const oldSettlement = old?.bankSettlementStatus || old?.paycrestStatus
    const nextSettlement = row.bankSettlementStatus || row.paycrestStatus
    const earlierStage = !nextSettlement || ['created','initiated','pending','processing','submitted','deposited','fulfilling','fulfilled','settling'].includes(nextSettlement)
    const retainedSettlement = bank && old && ['settled','refunded'].includes(oldSettlement || '') && earlierStage
      ? {paycrestStatus:old.paycrestStatus,bankSettlementStatus:old.bankSettlementStatus || oldSettlement} : {}
    const receiptIdentity=bank && old?.eventId.startsWith('ngpos-') && !row.eventId.startsWith('ngpos-') ? {eventId:old.eventId,txHash:old.txHash} : {}
    const retainedDetails = Object.fromEntries(['accountName','bankName','bankLast4','recipient','amountNgn','fiatCurrency','feeAmount','paymentFunding'].flatMap(field => {
      const key = field as keyof PocketActivityRow
      return !row[key] && old?.[key] ? [[field, old[key]]] : []
    }))
    rows.set(rowKey(row), { ...row, ...retainedDetails, ...savedStatus, ...retainedSettlement, ...receiptIdentity, ...(bank && row.handoffVerified === undefined && old?.handoffVerified ? {handoffVerified:true} : {}), ...(bank && !row.bankSettlementStatus && !row.paycrestStatus?.trim() && old?.bankSettlementStatus ? {bankSettlementStatus:old.bankSettlementStatus} : {}), ts: old?.ts || row.ts })
  }
  // Fees are a second USDC log in the same payment batch, not a second send.
  // A standalone transfer to treasury, a different sender/chain, or an ambiguous
  // multi-recipient transaction must remain visible.
  const observed = [...rows.values()]
  const feeRows = new Set<PocketActivityRow>()
  const fees = new Map<string, string>()
  for (const fee of observed) {
    if (fee.source !== 'wallet-withdrawal' || fee.direction !== 'out' || !/^0x[0-9a-f]{64}$/i.test(fee.txHash)
      || fee.recipient?.toLowerCase() !== EVM_PLATFORM_TREASURY.toLowerCase() || fee.assetSymbol && fee.assetSymbol !== 'USDC') continue
    const peers = observed.filter(row => row !== fee && row.source === 'wallet-withdrawal' && row.direction === 'out'
      && transactionKey(row) === transactionKey(fee) && row.payer.toLowerCase() === fee.payer.toLowerCase()
      && row.recipient && row.recipient.toLowerCase() !== EVM_PLATFORM_TREASURY.toLowerCase()
      && (!row.assetSymbol || row.assetSymbol === 'USDC'))
    if (peers.length !== 1) continue
    feeRows.add(fee)
    fees.set(transactionKey(fee), fee.amount)
  }
  const values = observed.filter(row => !feeRows.has(row)).map(row => row.direction === 'out' && fees.has(transactionKey(row))
    ? { ...row, feeAmount: fees.get(transactionKey(row)) } : row)
  const refundDeposits = new Set(values.filter(row => row.source === 'bills' && row.refundTxHash).map(row => transactionKey({ ...row, txHash: row.refundTxHash! }) + ':' + Number(row.amount)))
  const contextual = new Set(values.filter(row => row.source && !['wallet-deposit', 'wallet-withdrawal'].includes(row.source)).map(row => transactionKey(row) + ':' + (row.direction || 'in')))
  for(const row of values){
    if(row.source==='wallet-bridge'&&row.destinationTxHash&&row.destination)contextual.add(transactionKey({...row,chain:row.destination,txHash:row.destinationTxHash})+':in')
  }
  return values.filter(row => !['wallet-deposit', 'wallet-withdrawal'].includes(row.source || '')
    || (!contextual.has(transactionKey(row) + ':' + (row.direction || 'in'))
      && !(row.source === 'wallet-deposit' && (!row.assetSymbol || row.assetSymbol === 'USDC') && refundDeposits.has(transactionKey(row) + ':' + Number(row.amount)))))
    .sort((a, b) => b.ts - a.ts || rowKey(a).localeCompare(rowKey(b)))
}

export function mergePocketActivitySnapshot(previous: PocketActivityReadData | undefined, incoming: PocketActivityReadData): PocketActivityReadData {
  const retired=new Map((previous?.merchants||[]).filter(m=>m.deleted_at).map(m=>[m.merchant_id,m.deleted_at]))
  const grouped=new Set([...(previous?.groupedTransactionHashes||[]),...(incoming.groupedTransactionHashes||[])].map(hash=>hash.toLowerCase()))
  return {
    ...incoming,
    groupedTransactionHashes:[...grouped],
    payments: mergePocketActivityRows(previous?.payments ?? [], incoming.payments).filter(row=>!row.txHash||!grouped.has(row.txHash.toLowerCase())),
    merchants: [...new Map([...(previous?.merchants ?? []), ...incoming.merchants].map(row => [row.merchant_id, {...row,deleted_at:row.deleted_at||retired.get(row.merchant_id)}])).values()],
    collections: [...new Map([...(previous?.collections ?? []), ...incoming.collections].map(row => [row.eventId, row])).values()],
  }
}
