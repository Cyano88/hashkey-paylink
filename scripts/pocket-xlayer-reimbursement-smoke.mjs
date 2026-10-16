import assert from 'node:assert/strict'
import {decodeFunctionData,encodeFunctionData,parseAbi} from 'viem'
import {quoteXLayerReimbursement,sealXLayerReimbursement,openXLayerReimbursement,refreshXLayerReimbursement} from '../api/pocket/xlayer-reimbursement.ts'
import {makeSponsoredBatchRequest} from '../src/pocket/lib/pocketSponsoredRequest.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='synthetic-xlayer-reimbursement-secret-not-production'
const abi=parseAbi(['function transfer(address,uint256) returns(bool)'])
const wallet='0x1111111111111111111111111111111111111111',recipient='0x2222222222222222222222222222222222222222'
const now=100000
const pricing={marginBps:2500,minimumFeeUnits:'0'} // Test policy only.
for(const [asset,token] of [['USDC','0xb6ceceab302e2e4948951ee7843fc24e92933061'],['USDT','0x779ded0c9e1022225f8e0630b35a9b54be713736']]){
 const binding={ownerId:'owner',walletId:'wallet',walletAddress:wallet,asset,amountUnits:'1000000',intentId:'intent'}
 const calls=[{to:token,data:encodeFunctionData({abi,functionName:'transfer',args:[recipient,1000000n]}),value:'0x0'}]
 let count=0
 const estimate=async input=>{count++;assert.equal(input.calls.length,2);assert.deepEqual(input.calls[0],calls[0]);return {feeUnits:'213',expiresAt:now+20000,estimateId:'provider-estimate'}}
 const q=await quoteXLayerReimbursement(binding,calls,now+60000,estimate,pricing,()=>now)
 assert.equal(count,2);assert.equal(q.totalUnits,'1000267');assert.equal(q.expiresAt,now+20000)
 const feeCall=q.calls[1],decoded=decodeFunctionData({abi,data:feeCall.data})
 assert.equal(feeCall.to.toLowerCase(),token);assert.equal(decoded.args[0].toLowerCase(),EVM_PLATFORM_TREASURY.toLowerCase());assert.equal(decoded.args[1],267n)
 const signed=sealXLayerReimbursement(q)
 const batch=makeSponsoredBatchRequest({appId:'fixture',walletId:'wallet',attemptId:'intent',expiresAt:q.expiresAt,calls:q.calls})
 assert.equal(batch.body.method,'wallet_sendCalls');assert.equal(batch.body.caip2,'eip155:196');assert.equal(batch.body.sponsor,true);assert.deepEqual(batch.body.params.calls,q.calls)
 assert.equal('transaction' in batch.body.params,false);assert.equal('sponsor_options' in batch.body,false)
 assert.deepEqual(await refreshXLayerReimbursement(q,calls,async input=>{assert.deepEqual(input.calls,q.calls);return {feeUnits:'100',expiresAt:now+20000,estimateId:'lower'}},()=>now),q)
 // Even when raw cost fits, submission must retain the full approved buffer.
 await assert.rejects(()=>refreshXLayerReimbursement(q,calls,async()=>({feeUnits:'214',expiresAt:now+20000,estimateId:'margin-eroded'}),()=>now),/fee increased/)
 await assert.rejects(()=>refreshXLayerReimbursement(q,calls,async()=>({feeUnits:'300',expiresAt:now+20000,estimateId:'higher'}),()=>now),/fee increased/)
 assert.deepEqual(openXLayerReimbursement(signed,binding,calls,now),q)
 for(const field of ['ownerId','walletId','walletAddress','asset','amountUnits','intentId'])assert.throws(()=>openXLayerReimbursement(signed,{...binding,[field]:'other'},calls,now))
 assert.throws(()=>openXLayerReimbursement(signed,binding,[{...calls[0],data:'0x1234'}],now))
 assert.throws(()=>openXLayerReimbursement(signed,binding,calls,q.expiresAt))
 for(const change of [{version:1},{pricing:{marginBps:0,minimumFeeUnits:'0'}},{pricing:{...pricing,minimumFeeUnits:'268'}},{totalUnits:'1000000'},{chainId:1},{networkFeeUnits:'0'},{calls:[...q.calls.slice(0,1),{...feeCall,to:recipient}]}])assert.throws(()=>openXLayerReimbursement(sealXLayerReimbursement({...q,...change}),binding,calls,now))
 await assert.rejects(()=>quoteXLayerReimbursement(binding,calls,now+60000,async()=>{throw Error('quote unavailable')},pricing,()=>now),/quote unavailable/)
 await assert.rejects(()=>quoteXLayerReimbursement(binding,calls,now+60000,async()=>({feeUnits:'213',expiresAt:now,estimateId:'expired'}),pricing,()=>now))
 await assert.rejects(()=>quoteXLayerReimbursement(binding,calls,now+60000,async input=>({feeUnits:(decodeFunctionData({abi,data:input.calls.at(-1).data}).args[1]+1n).toString(),expiresAt:now+20000,estimateId:'rising'}),pricing,()=>now),/estimate changed/)
 await assert.rejects(()=>quoteXLayerReimbursement(binding,calls,now+60000,estimate,undefined,()=>now))
 for(const result of [{feeUnits:'1',expiresAt:now,estimateId:'expired'},{feeUnits:'1',expiresAt:now+20000,estimateId:''},{feeUnits:'bad',expiresAt:now+20000,estimateId:'bad'}])await assert.rejects(()=>refreshXLayerReimbursement(q,calls,async()=>result,()=>now))
 const floored=await quoteXLayerReimbursement(binding,calls,now+60000,estimate,{...pricing,minimumFeeUnits:'500'},()=>now)
 assert.equal(floored.networkFeeUnits,'500')
}
console.log('PASS USDC/USDT full-batch reimbursement, exact treasury/total binding, owner and intent isolation, expiry, missing estimate and unstable fee rejection. Synthetic estimator only; production adapter not connected.')
