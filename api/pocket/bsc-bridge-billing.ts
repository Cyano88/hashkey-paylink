import type {BscBridgeOperation} from './bsc-bridge-operations.js'
import type {BscFeePrice} from './bsc-fee-estimator.js'
import {sumPrivyTransactionGas,type PrivyGasBinding} from './privy-transaction-gas.js'
export type BscBillingHalt={at:number;billedUsdMicros:string;coverageUsdMicros:string}
const unavailable=():never=>{throw Error('Swap fees are still being verified.')}
/** Scope both sides to BSC transactions; wallet-wide Privy spending also
 * contains X Layer and must never be used as the BSC invoice. */
export function bscBridgeBillingRecords(operations:BscBridgeOperation[],walletId:string,now:number){return operations.filter(o=>o.quote.walletId===walletId&&o.createdAt>=now-28*86400000&&!['prepared','cancelled','not_submitted'].includes(o.state))}
export function createBscBridgeBillingGuard(d:{now():number;halted():Promise<BscBillingHalt|undefined>;halt(value:BscBillingHalt):Promise<unknown>;transaction(id:string):Promise<unknown>;billed?(bindings:PrivyGasBinding[]):Promise<bigint>;prices():Promise<Record<string,BscFeePrice>>}){
 return async(operations:BscBridgeOperation[],walletId:string)=>{
  if(await d.halted())throw Error('BNB Chain sponsorship is paused for a fee review.')
  const now=d.now()
  const records=bscBridgeBillingRecords(operations,walletId,now)
  if(!records.length)return
  if(records.some(o=>!['completed','failed','refunded'].includes(o.state)||!o.hash||!o.transactionId))return unavailable()
  const bindings=records.map(o=>({transactionId:o.transactionId!,walletId,chainId:56 as const,hash:o.hash!}))
  const billed=d.billed?await d.billed(bindings):await sumPrivyTransactionGas(bindings,d.transaction)
  const completed=records.filter(o=>['completed','refunded'].includes(o.state))
  const prices=completed.length?await d.prices():{}
  let coverage=0n
  for(const op of completed){
   const p=prices[op.quote.from]
   if(!p||typeof p.scaled8!=='bigint'||p.scaled8<=0n||!Number.isSafeInteger(p.observedAt)||p.observedAt>now+5000||p.observedAt+30000<=now)return unavailable()
   // 18-decimal token * 8-decimal USD price -> USD micros; haircut 5%.
   coverage+=BigInt(op.quote.reimbursementUnits)*p.scaled8*95n/(10n**20n*100n)
  }
  if(billed>coverage){
   await d.halt({at:now,billedUsdMicros:String(billed),coverageUsdMicros:String(coverage)})
   throw Error('BNB Chain sponsorship is paused for a fee review.')
  }
 }
}
