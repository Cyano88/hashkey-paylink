import type {BscOperation} from './bsc-operations.js'
import type {BscFeePrice} from './bsc-fee-estimator.js'
import {readBscSwapSettlement} from './bsc-settlement.js'
import type {XLayerCostRpc} from './xlayer-sponsored-cost.js'
export type BscCollectedCoverage={walletId:string;at:number;hash:string;coverageUsdMicros:bigint}
/** Conservative supplementary coverage for the existing wallet-wide Privy
 * invoice: count only canonical BSC reimbursements, never subtract guessed gas. */
export async function bscCollectedCoverage(operations:BscOperation[],d:{now:number;rpc:XLayerCostRpc;prices():Promise<Record<string,BscFeePrice>>},wallet?:string):Promise<BscCollectedCoverage[]>{
 const records=operations.filter(o=>o.quote.from!=='BNB'&&o.createdAt>=d.now-28*86400000&&(!wallet||o.quote.walletAddress.toLowerCase()===wallet.toLowerCase())&&!['prepared','cancelled','not_submitted'].includes(o.state))
 if(!records.length)return []
 if(records.some(o=>!['completed','failed'].includes(o.state)||!o.hash))throw Error('Swap fees are still being verified.')
 const hashes=records.map(o=>o.hash!.toLowerCase());if(new Set(hashes).size!==hashes.length)throw Error('Duplicate BSC receipt.')
 const prices=await d.prices(),output:BscCollectedCoverage[]=[]
 for(let offset=0;offset<records.length;offset+=4){
  output.push(...await Promise.all(records.slice(offset,offset+4).map(async op=>{
   const proof=await readBscSwapSettlement(op.quote,op.hash!,d.rpc,op.userOperationHash)
   if(proof.status!==op.state)throw Error('Swap fees are still being verified.')
   const p=prices[op.quote.from]
   if(!p||p.scaled8<=0n||!Number.isSafeInteger(p.observedAt)||p.observedAt>d.now+5000||p.observedAt+30000<=d.now)throw Error('Swap fee valuation is unavailable.')
   return {walletId:op.quote.walletId,at:op.createdAt,hash:op.hash!,coverageUsdMicros:proof.status==='completed'?BigInt(op.quote.reimbursementUnits)*p.scaled8*95n/(100n*10n**20n):0n}
  })))
 }
 return output
}
