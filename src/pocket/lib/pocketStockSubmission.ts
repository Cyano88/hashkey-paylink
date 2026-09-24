import type { Hex } from 'viem'

export type StockTradeStage = 'idle' | 'preparing' | 'processing' | 'confirming' | 'completed' | 'failed'
export type StockPending = { key: string; hash: Hex; kind?: 'approval' | 'trade' | 'send'; status: 'pending' | 'confirmed' | 'failed' }
export const signingKey = (key: string) => 'pocket.xstocks.signing:' + key
const pendingKey = (key: string) => 'pocket.xstocks.pending:' + key
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
  if (/^0x[0-9a-f]{64}$/i.test(saved.hash) && ['approval', 'trade', 'send'].includes(saved.kind)) return { key, hash: saved.hash, kind: saved.kind, status: 'pending' }
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
 const current = readStockPending(pending.key)
 if (current?.hash === pending.hash) {
  localStorage.setItem(lastKey(pending.key), JSON.stringify(settled))
  localStorage.removeItem(pendingKey(pending.key))
 }
 return settled
}
export async function runStockSubmission(options: {
 key: string; kind: NonNullable<StockPending['kind']>;
 send: () => Promise<{ hash: Hex }>;
 wait?: (hash: Hex) => Promise<{ status: string }>;
 onPending: (pending: StockPending) => void;
 onUncertain: (uncertain: boolean) => void;
 onSubmitted?: () => void;
}) {
 const { key, kind, send, wait, onPending, onUncertain, onSubmitted } = options
 localStorage.setItem(signingKey(key), String(Date.now()))
 // Signing in progress is not an uncertain outcome. Only a rejected call with
 // an unknown broadcast outcome sets that warning.
 onUncertain(false)
 let hash: Hex | undefined
 try {
  const result = await send()
  if (!/^0x[0-9a-f]{64}$/i.test(result.hash)) throw Error('The wallet returned an invalid transaction reference.')
  hash = result.hash
  const pending: StockPending = { key, kind, hash, status: 'pending' }
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
   if (definitelyNotSent) localStorage.removeItem(signingKey(key))
   onUncertain(!definitelyNotSent)
  }
  const error = stockSubmissionError(reason)
  if (hash && readStockPending(key)?.hash === hash) Object.assign(error, {transactionPending:true})
  throw error
 }
}
