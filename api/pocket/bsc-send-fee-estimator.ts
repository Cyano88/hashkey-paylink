import {bscSendCalls,type BscSendQuote} from '../../src/pocket/lib/pocketBscSend.js'
import {estimatePrivySponsoredBatchGas,type XLayerCostRpc} from './xlayer-sponsored-cost.js'
import {priceBscSponsorship,type BscFeePolicy,type BscFeePrice} from './bsc-fee-estimator.js'
const fail=():never=>{throw Error('BNB Chain network fee is temporarily unavailable.')}
const quantity=(v:unknown):bigint=>{if(typeof v!=='string'||!/^0x[0-9a-f]{1,64}$/i.test(v))return fail();return BigInt(v)}
export function createBscSendFeeEstimator(d:{rpc:XLayerCostRpc;prices(asset:'USDC'|'USDT'):Promise<{bnb:BscFeePrice;stable:BscFeePrice}>;policy:BscFeePolicy;now?():number}){
 const policy=structuredClone(d.policy),now=d.now||Date.now
 return async(q:BscSendQuote)=>{
  const calls=bscSendCalls(q,now())
  const [gas,suggestion,spot,prices]=await Promise.all([
   estimatePrivySponsoredBatchGas(d.rpc,q.walletAddress,calls,56),d.rpc('rundler_getUserOperationGasPrice',[]),d.rpc('eth_gasPrice',[]),d.prices(q.asset),
  ])
  const suggested=quantity(suggestion?.suggested?.maxFeePerGas),nativePrice=quantity(spot)
  if(suggested<=0n||nativePrice<=0n)return fail()
  const blockNumber=quantity(suggestion?.blockNumber)
  const block=await d.rpc('eth_getBlockByNumber',['0x'+blockNumber.toString(16),false])
  if(quantity(block?.number)!==blockNumber||!/^0x[0-9a-f]{64}$/i.test(block?.hash))return fail()
  const blockTime=Number(quantity(block.timestamp))*1000
  if(!Number.isSafeInteger(blockTime)||blockTime>now()+5000||blockTime+30000<=now())return fail()
  const networkWei=(gas.totalGas+25000n)*(suggested>nativePrice?suggested:nativePrice)
  const fee=priceBscSponsorship(networkWei,prices.bnb,prices.stable,policy,now())
  const coverage=priceBscSponsorship(networkWei,prices.bnb,prices.stable,{...policy,marginBps:0},now())
  const expiresAt=Math.min(q.expiresAt,prices.bnb.observedAt+30000,prices.stable.observedAt+30000,blockTime+30000)
  if(expiresAt<=now())return fail()
  return {feeUnits:String(fee),coverageFeeUnits:String(coverage),expiresAt}
 }
}
