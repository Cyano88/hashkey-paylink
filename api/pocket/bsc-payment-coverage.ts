import type {BscPaymentOperation} from './bsc-payment-operations.js'
import type {BscFeePrice} from './bsc-fee-estimator.js'
import type {XLayerCostRpc} from './xlayer-sponsored-cost.js'
import {readBscPaymentSettlement} from './bsc-payment-settlement.js'
export async function bscPaymentCoverage(operations:BscPaymentOperation[],d:{now:number;rpc:XLayerCostRpc;prices():Promise<Record<string,BscFeePrice>>},wallet?:string){
 const ops=operations.filter(o=>o.createdAt>=d.now-28*86400000&&(!wallet||o.quote.walletAddress.toLowerCase()===wallet.toLowerCase())&&!['prepared','cancelled','not_submitted'].includes(o.state))
 if(!ops.length)return []
 if(ops.some(o=>!['completed','failed'].includes(o.state)||!o.hash)||new Set(ops.map(o=>o.hash!.toLowerCase())).size!==ops.length)throw Error('Payment fees are still being verified.')
 const prices=await d.prices(),result=[]
 for(const op of ops){
  const proof=await readBscPaymentSettlement(op.quote,op.hash!,d.rpc,op.userOperationHash)
  if(proof.status==='pending'||proof.status!==op.state)throw Error('Payment fees are still being verified.')
  const price=prices[op.quote.asset]
  if(!price||price.scaled8<=0n||price.observedAt>d.now+5000||price.observedAt+30000<=d.now)throw Error('Payment fee price is unavailable.')
  result.push({walletId:op.quote.walletId,at:op.createdAt,hash:op.hash!,coverageUsdMicros:proof.status==='failed'?0n:BigInt(op.quote.reimbursementUnits)*price.scaled8*95n/(10n**20n*100n)})
 }
 return result
}
