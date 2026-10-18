import { EVM_PLATFORM_TREASURY } from '../../lib/platformFees'
import type { PocketActivityReadData, PocketActivityRow } from './pocketSchemas'

const transactionKey = (row: PocketActivityRow) => JSON.stringify([
  row.chain.toLowerCase(), /^0x/i.test(row.txHash) ? row.txHash.toLowerCase() : row.txHash,
])
const decimalIdentity = (value: string) => value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value
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
  // Durable native-send records own their exact principal. Do not show the
  // indexer's copy of that same transfer as another send.
  const observed = [...rows.values()].filter(row => !row.txHash || row.eventId.startsWith('pocket-native-send:') || ![...rows.values()].some(parent =>
    parent.eventId.startsWith('pocket-native-send:') && parent.txHash && transactionKey(parent) === transactionKey(row)
    && row.source === 'wallet-withdrawal' && parent.assetSymbol === row.assetSymbol
    && parent.payer.toLowerCase() === row.payer.toLowerCase() && parent.recipient?.toLowerCase() === row.recipient?.toLowerCase()
    && decimalIdentity(parent.amount) === decimalIdentity(row.amount)))
  // Same-batch reimbursement belongs to its one unambiguous principal.
  // Never suppress a standalone treasury transfer or a different asset/owner.
  const feeRows = new Set<PocketActivityRow>()
  const fees = new Map<PocketActivityRow, string>()
  const outgoing = (row: PocketActivityRow) => ['wallet-withdrawal','wallet-transfer'].includes(row.source || '') && row.direction === 'out'
  const asset = (row: PocketActivityRow) => (row.assetSymbol || 'USDC').toUpperCase().replace(/^USDT0$/, 'USDT')
  for (const fee of observed) {
    if (!outgoing(fee) || !/^0x[0-9a-f]{64}$/i.test(fee.txHash)
      || fee.recipient?.toLowerCase() !== EVM_PLATFORM_TREASURY.toLowerCase()
      || !['USDC','USDT','ETH','POL','OKB'].includes(asset(fee))) continue
    const peers = observed.filter(row => row !== fee && outgoing(row)
      && transactionKey(row) === transactionKey(fee) && row.payer.toLowerCase() === fee.payer.toLowerCase()
      && row.recipient && row.recipient.toLowerCase() !== EVM_PLATFORM_TREASURY.toLowerCase()
      && asset(row) === asset(fee))
    const feePeers = observed.filter(row => outgoing(row) && transactionKey(row) === transactionKey(fee)
      && row.payer.toLowerCase() === fee.payer.toLowerCase() && asset(row) === asset(fee)
      && row.recipient?.toLowerCase() === EVM_PLATFORM_TREASURY.toLowerCase())
    if (peers.length !== 1 || feePeers.length !== 1) continue
    feeRows.add(fee)
    fees.set(peers[0], fee.amount)
    // A bank/payment action replaces the raw principal in the visible feed.
    // Carry its reimbursement to that same owner and asset's receipt too.
    const parents = observed.filter(row => row.txHash && row.direction === 'out'
      && row.source && !['wallet-deposit','wallet-withdrawal','wallet-transfer'].includes(row.source)
      && transactionKey(row) === transactionKey(fee)
      && row.payer.toLowerCase() === fee.payer.toLowerCase() && asset(row) === asset(fee))
    if (parents.length === 1) fees.set(parents[0], fee.amount)
  }
  const values = observed.filter(row => !feeRows.has(row)).map(row => fees.has(row)
    ? { ...row, feeAmount: fees.get(row) } : row)
  const refundKey = (row: PocketActivityRow) => transactionKey(row) + ':' + (row.assetSymbol || 'USDC') + ':' + Number(row.amount)
  const refundDeposits = new Set(values.filter(row => ['bills','esim'].includes(row.source || '') && row.refundTxHash).map(row => refundKey({ ...row, txHash: row.refundTxHash! })))
  const contextual = new Set(values.filter(row => row.txHash && row.source && !['wallet-deposit', 'wallet-withdrawal', 'wallet-transfer'].includes(row.source)).map(row => transactionKey(row) + ':' + (row.direction || 'in')))
  for(const row of values){
    if(row.source==='wallet-bridge'&&row.destinationTxHash&&row.destination)contextual.add(transactionKey({...row,chain:row.destination,txHash:row.destinationTxHash})+':in')
  }
  return values.filter(row => !['wallet-deposit', 'wallet-withdrawal'].includes(row.source || '')
    || (!contextual.has(transactionKey(row) + ':' + (row.direction || 'in'))
      && !(row.source === 'wallet-deposit' && refundDeposits.has(refundKey(row)))))
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
