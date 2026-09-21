import crypto from 'node:crypto'
import type { PocketActivityRow } from '../../src/pocket/models/pocketActivity.js'
import { pocketReportReasons, type PocketReportSelector } from '../../src/pocket/lib/pocketTransactionReport.js'
import { pocketActivityStatus } from '../../src/pocket/lib/pocketReceipt.js'

export function reportTransaction(rows: PocketActivityRow[], input: unknown) {
  const selector = input as Partial<PocketReportSelector> | undefined
  if (!selector || !['chain','eventId','txHash'].every(key => typeof (selector as any)[key] === 'string' && (selector as any)[key].length <= 600) || !selector.chain || !selector.eventId) throw Object.assign(new Error('Choose a valid transaction.'), {status:400})
  const rowsFound = rows.filter(row => row.chain.toLowerCase() === selector.chain!.toLowerCase() && row.eventId === selector.eventId && row.txHash.toLowerCase() === selector.txHash!.toLowerCase())
  if (!rowsFound.length) throw Object.assign(new Error('This transaction is still syncing. Open it from Activity and try again.'), {status:404})
  return rowsFound.sort((a,b)=>Number(Boolean(b.bankOrderId))-Number(Boolean(a.bankOrderId)))[0]
}
export function transactionReportKey(row: PocketActivityRow) {
  return crypto.createHash('sha256').update(JSON.stringify([row.chain.toLowerCase(),row.source||'',row.bankOrderId||row.providerReference||row.receiptId||row.eventId,row.bankOrderId||row.providerReference?'':row.txHash.toLowerCase()])).digest('hex')
}
export function transactionReportDetails(row: PocketActivityRow, now: number) {
  return { network:row.chain, eventId:row.eventId, transactionHash:row.txHash, receiptId:row.receiptId,
    providerReference:row.bankOrderId||row.providerReference||row.billReference, source:row.source,
    amountUsdc:row.amount, amountNgn:row.amountNgn, status:pocketActivityStatus(row), recordedStatus:row.paycrestStatus,
    transactionAt:row.ts, capturedAt:now, payer:row.payer, recipient:row.recipient,
    bankName:row.bankName, bankLast4:row.bankLast4, billProvider:row.billProvider, billCategory:row.billCategory }
}
export function validateTransactionReport(reason: unknown, description: unknown) {
  const found=pocketReportReasons.find(([key])=>key===reason)
  const text=typeof description==='string'?description.trim():''
  if(!found||text.length<10||text.length>1500)throw Object.assign(new Error('Select a reason and describe the problem in 10 to 1,500 characters.'),{status:400})
  return {reason:found[0],label:found[1],description:text}
}
export function upsertTransactionReport<T extends {id:string;profileId:string;status:string;transactionKey?:string}>(cases:Record<string,T>,item:T) {
  const existing=Object.values(cases).find(row=>row.profileId===item.profileId&&row.transactionKey===item.transactionKey&&row.status!=='resolved')
  if(existing)return {item:existing,reused:true}
  cases[item.id]=item
  return {item,reused:false}
}
