import type { PocketActivityRow } from './pocketSchemas'

export const POCKET_OPERATIONS_UPDATED = 'pocket:operations-updated'
export type PocketOperation = {
  id: string; owner: string; kind: 'bridge' | 'swap'; createdAt: number;
  state: 'awaiting_approval' | 'processing' | 'completed' | 'failed' | 'refunded' | 'needs_review';
  // Provider quote and identifiers are retained, never wallet authentication.
  pending: any;
}
const executing = new Set<string>()
export const beginPocketOperation=(owner:string,id:string)=>executing.add(owner.trim().toLowerCase()+':'+id)
export const endPocketOperation=(owner:string,id:string)=>{
 const removed=executing.delete(owner.trim().toLowerCase()+':'+id)
 if(removed&&typeof window!=='undefined')window.dispatchEvent(new Event(POCKET_OPERATIONS_UPDATED))
 return removed
}
export const pocketOperationExecuting=(owner:string,id:string)=>executing.has(owner.trim().toLowerCase()+':'+id)
const prefix = (owner: string) => 'pocket:operation:v1:' + encodeURIComponent(owner.trim().toLowerCase()) + ':'
export function readPocketOperations(owner: string, storage: Storage = localStorage): PocketOperation[] {
  return Object.keys(storage).filter(key => key.startsWith(prefix(owner))).flatMap(key => {
    try { const record = JSON.parse(storage.getItem(key) || 'null'); return record?.id && record.pending?.quote?.id && record.pending?.quoteToken && ['bridge','swap'].includes(record.kind) && record.owner === owner.trim().toLowerCase() ? [record] : [] } catch { return [] }
  })
}
export function trackPocketOperation(owner: string, kind: PocketOperation['kind'], pending: any, state: PocketOperation['state'] = 'processing', storage: Storage = localStorage) {
  if (!owner || !pending?.quote?.id || !pending.quoteToken) return
  const id = kind + ':' + pending.quote.id, key = prefix(owner) + id
  let old: PocketOperation | null = null
  try {old=JSON.parse(storage.getItem(key)||'null')}catch{/* Replace a damaged entry only with a valid operation. */}
  if (old && ['completed', 'failed', 'refunded'].includes(old.state)) return
  const record: PocketOperation = {id, owner: owner.trim().toLowerCase(), kind, state, createdAt: old?.createdAt || Date.now(), pending: {...old?.pending, ...pending}}
  if(old&&JSON.stringify(old)===JSON.stringify(record))return
  storage.setItem(key, JSON.stringify(record))
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(POCKET_OPERATIONS_UPDATED))
  return record
}
export function migratePocketOperations(owner: string) {
  const bridge = 'pocket:usdt-bridge:v1:' + encodeURIComponent(owner)
  const swap = 'pocket:arc-mainnet:swap:' + owner
  for (const [key, storage, kind] of [[bridge, localStorage, 'bridge'], [swap, sessionStorage, 'swap']] as const) {
    let saved: any
    try {saved=JSON.parse(storage.getItem(key)||'null')}catch{continue}
    if (saved?.quote?.id && saved.quoteToken) { trackPocketOperation(owner, kind, saved); storage.removeItem(key) }
  }
}
export function mergePocketOperations(rows: PocketActivityRow[], records: PocketOperation[]): PocketActivityRow[] {
  const result = [...rows]
  for (const record of records) {
    const p = record.pending, q = p.quote, source = record.kind === 'bridge' ? 'wallet-bridge' : 'wallet-swap'
    const network = record.kind === 'bridge' ? q.source : 'arc'
    const index = result.findIndex(row => row.source === source && row.chain === network && (row.providerReference === q.id || (p.txHash && (network==='solana'?row.txHash===p.txHash:row.txHash?.toLowerCase()===p.txHash.toLowerCase()))))
    const local: PocketActivityRow = {...(q.purpose==='cash'&&q.destination==='base'?{cashFunding:true,activityLabel:'Cash funding'}:{}),eventId: 'operation:' + record.id, providerReference: q.id, txHash: p.txHash || '', chain: network, payer: p.walletAddress || q.walletAddress || 'Pocket wallet', amount: q.amount, ...(record.state==='refunded'?{refundAsset:p.refundAsset,refundAmount:p.refundAmount,refundNetwork:p.refundNetwork,refundTxHash:p.refundTxHash}:{}), assetSymbol: record.kind === 'bridge' ? q.rail==='xlayer'?(q.asset==='USDT'?'USDT':'USDC'):'USDT' : q.tokenIn.symbol, ts: record.createdAt, source, direction: 'out', paycrestStatus: record.state, destination: q.destination || q.tokenOut?.symbol, memo: record.kind === 'bridge' ? 'Bridge' : 'Swap'}
    if (index < 0) result.push(local)
    else if (!['completed', 'failed', 'refunded'].includes(result[index].paycrestStatus || '')) result[index] = {...result[index], paycrestStatus: record.state}
  }
  return result.sort((a, b) => b.ts - a.ts)
}
