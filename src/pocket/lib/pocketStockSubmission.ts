import type { Hex } from 'viem'

export type StockTradeStage = 'idle' | 'preparing' | 'processing' | 'confirming' | 'completed' | 'failed'
export type StockPending = { id?:string; gift?:{id:string;attemptId:string;operation:'approval'|'funding'|'claim'|'refund'}; xpayPaymentId?:string; details?:{recipient:string;amount:string;symbol:string;at:number}; key: string; hash: Hex; kind?: 'approval' | 'trade' | 'send' | 'gift'; status: 'pending' | 'confirmed' | 'failed' }
export const signingKey = (key: string) => 'pocket.xstocks.signing:' + key
const pendingKey = (key: string) => 'pocket.xstocks.pending:' + key
export const STOCK_ATTEMPTS_UPDATED='pocket:stock-attempts-updated'
const historyKey=(key:string,id:string)=>'pocket.xstocks.attempt:'+encodeURIComponent(key)+':'+id
export function readStockAttempts(key:string):StockPending[]{
 const prefix='pocket.xstocks.attempt:'+encodeURIComponent(key)+':'
 const rows:StockPending[]=[]
 for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(prefix)){const r=JSON.parse(localStorage.getItem(k)||'null');if(r?.key===key)rows.push(r)}}
 return rows
}
function saveStockAttempt(record:StockPending){if(!record.id)return;const k=historyKey(record.key,record.id);const old=JSON.parse(localStorage.getItem(k)||'null');if(old&&old.status!=='pending'&&record.status==='pending')return;localStorage.setItem(k,JSON.stringify(record));if(typeof window!=='undefined')window.dispatchEvent(new Event(STOCK_ATTEMPTS_UPDATED))}
const lastKey = (key: string) => 'pocket.xstocks.last:' + key

// This exact deployed chunk was inspected: it loads user authorization BEFORE the
// signed wallet RPC request. Do not broaden to arbitrary chunk or network errors.
export function isPrivyAuthorizationLoadError(reason: unknown): boolean {
 let current = reason
 for (let depth = 0; current && depth < 4; depth++) {
  const error = current as { message?: string; cause?: unknown }
  const message = typeof current === 'string' ? current : error.message || ''
  if (/Loading chunk 3374 failed/i.test(message) && /https:\/\/auth\.privy\.io\/_next\/static\/chunks\/3374\.c0ad4faf4fb4d221\.js(?:[?\s)]|$)/.test(message)) return true
  current = error.cause
 }
 return false
}
export function stockSubmissionError(reason: unknown): Error & { reconnectWallet?: boolean } {
 if (isPrivyAuthorizationLoadError(reason)) return Object.assign(new Error('Your wallet connection could not load. Reload Pocket to restore it, then try again.'), { reconnectWallet: true })
 return reason instanceof Error ? reason : new Error('The transaction could not complete. Check Activity before retrying.')
}
export function readStockPending(key: string): StockPending | null {
 const value = localStorage.getItem(pendingKey(key))
 if (!value) return null
 if (/^0x[0-9a-f]{64}$/i.test(value)) return { key, hash: value as Hex, status: 'pending' }
 try {
  const saved = JSON.parse(value)
  if (/^0x[0-9a-f]{64}$/i.test(saved.hash) && ['approval', 'trade', 'send', 'gift'].includes(saved.kind)) return { ...saved, key, hash: saved.hash, kind: saved.kind, status: 'pending' }
 } catch { /* An unknown record never authorizes a retry. */ }
 return null
}
export function readStockLast(key: string): StockPending | null {
 try {
  const saved=JSON.parse(localStorage.getItem(lastKey(key)) || 'null')
  if(saved?.key===key && /^0x[0-9a-f]{64}$/i.test(saved.hash) && ['confirmed','failed'].includes(saved.status)) return saved
 } catch { /* Ignore invalid history. */ }
 return null
}
export function hasStockSubmission(key: string) { return !!localStorage.getItem(signingKey(key)) || !!localStorage.getItem(pendingKey(key)) }
export function settleStockPending(pending: StockPending, success: boolean): StockPending {
 const settled: StockPending = { ...pending, status: success ? 'confirmed' : 'failed' }
 saveStockAttempt(settled)
 const current = readStockPending(pending.key)
 if (current?.hash === pending.hash) {
  localStorage.setItem(lastKey(pending.key), JSON.stringify(settled))
  localStorage.removeItem(pendingKey(pending.key))
 }
 return settled
}
export async function runStockSubmission(options: {
 key: string; kind: NonNullable<StockPending['kind']>; xpayPaymentId?:string;
 gift?:StockPending['gift']; details?:StockPending['details'];
 send: () => Promise<{ hash: Hex }>;
 wait?: (hash: Hex) => Promise<{ status: string }>;
 onPending: (pending: StockPending) => void;
 onUncertain: (uncertain: boolean) => void;
 onSubmitted?: () => void;
}) {
 const { key, kind, send, wait, onPending, onUncertain, onSubmitted, details, xpayPaymentId, gift } = options
 const existing=details?readStockAttempts(key).find(r=>r.status==='pending'&&r.details?.recipient.toLowerCase()===details.recipient.toLowerCase()&&r.details?.amount===details.amount&&r.details?.symbol===details.symbol):undefined
 if(existing){
  onPending(existing)
  try {
   if(!existing.hash)throw Error('This transfer is awaiting wallet confirmation. Check Activity.')
   if(wait){const receipt=await wait(existing.hash);onPending(settleStockPending(existing,receipt.status==='success'));if(receipt.status!=='success')throw Error('The transaction reverted.')}
   return existing.hash
  } catch(reason){const error=stockSubmissionError(reason);if(readStockAttempts(key).some(r=>r.id===existing.id&&r.status==='pending'))Object.assign(error,{transactionPending:true,attemptId:existing.id});throw error}
 }
 // Shared across hook instances: never start another signature while the
 // previous submission has no known transaction hash. Known-hash attempts
 // remain independently trackable and do not take this signing lock.
 if(localStorage.getItem(signingKey(key))||readStockAttempts(key).some(r=>r.status==='pending'&&!r.hash))throw Object.assign(new Error('A payment is still being checked. View Activity before trying again.'),{transactionPending:true})
 const id=crypto.randomUUID()
 const draft:StockPending={key,kind,id,details,xpayPaymentId,gift,hash:'' as Hex,status:'pending'}
 localStorage.setItem(signingKey(key), String(Date.now()))
 try{saveStockAttempt(draft)}catch(reason){localStorage.removeItem(signingKey(key));throw reason}
 // Signing in progress is not an uncertain outcome. Only a rejected call with
 // an unknown broadcast outcome sets that warning.
 onUncertain(false)
 let hash: Hex | undefined
 try {
  const result = await send()
  if (!/^0x[0-9a-f]{64}$/i.test(result.hash)) throw Error('The wallet returned an invalid transaction reference.')
  hash = result.hash
  const pending: StockPending = { key, kind, id, details, xpayPaymentId, gift, hash, status: 'pending' }
  saveStockAttempt(pending)
  localStorage.setItem(pendingKey(key), JSON.stringify(pending))
  localStorage.removeItem(signingKey(key))
  onPending(pending); onSubmitted?.()
  if (wait) {
   const receipt = await wait(hash)
   onPending(settleStockPending(pending, receipt.status === 'success'))
   if (receipt.status !== 'success') throw Error('The transaction reverted. Your trade did not complete.')
  }
  return hash
 } catch (reason) {
  if (!hash) {
   const definitelyNotSent = (reason as { code?: number })?.code === 4001 || isPrivyAuthorizationLoadError(reason)
   if (definitelyNotSent) {localStorage.removeItem(signingKey(key));saveStockAttempt({...draft,status:'failed'})}
   onUncertain(!definitelyNotSent)
  }
  const error = stockSubmissionError(reason)
  if(!hash&&localStorage.getItem(signingKey(key)))Object.assign(error,{transactionPending:true,attemptId:id})
  if (hash && readStockAttempts(key).some(r=>r.hash===hash&&r.status==='pending')) Object.assign(error, {transactionPending:true})
  throw error
 }
}

// Server-verified XPay source proof can clear only that payment's trade attempt.
export function settleXPaySourceProof(key:string,paymentId:string,hash:Hex){
 const matches=readStockAttempts(key).filter(r=>r.xpayPaymentId===paymentId&&r.kind==='trade'&&r.status==='pending'&&(!r.hash||r.hash.toLowerCase()===hash.toLowerCase()))
 if(matches.length!==1)return
 const r=matches[0]
 settleStockPending({...r,hash},true)
 if(!r.hash&&!readStockAttempts(key).some(other=>other.id!==r.id&&other.status==='pending'&&!other.hash))localStorage.removeItem(signingKey(key))
}

// Call only with a canonical gift receipt returned by the authenticated gift service.
export function settleStockGiftProof(key:string,giftId:string,operation:'funding'|'claim'|'refund',hash:Hex){
 if(!/^0x[0-9a-f]{64}$/i.test(hash))return
 const matches=readStockAttempts(key).filter(r=>r.gift?.id===giftId&&r.gift.operation===operation&&r.status==='pending'&&(!r.hash||r.hash.toLowerCase()===hash.toLowerCase()))
 if(matches.length!==1)return
 const record=matches[0];settleStockPending({...record,hash},true)
 if(!record.hash&&!readStockAttempts(key).some(r=>r.id!==record.id&&r.status==='pending'&&!r.hash))localStorage.removeItem(signingKey(key))
}
