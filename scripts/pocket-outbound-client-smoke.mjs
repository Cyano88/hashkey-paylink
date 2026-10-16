import assert from 'node:assert/strict'
import {encodeFunctionData,parseAbi} from 'viem'
import {validateOutboundBridge,sendOutboundBridge,outboundTokens} from '../src/pocket/api/pocketOutboundBridge.ts'
import {makeSponsoredBatchRequest,SponsoredTransferNotSubmitted} from '../src/pocket/lib/pocketSponsoredRequest.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
const owner='0x1111111111111111111111111111111111111111',recipient='0x2222222222222222222222222222222222222222',depository='0x4cd00e387622c35bddb9b4c962c136462338bc31',orderId='0x'+'a'.repeat(64)
const abi=parseAbi(['function approve(address,uint256) returns(bool)','function depositErc20(address,address,uint256,bytes32)','function transfer(address,uint256) returns(bool)'])
for(const asset of ['USDC','USDT']){
 const token=outboundTokens[asset],q={id:crypto.randomUUID(),rail:'xlayer',execution:'privy',source:'xlayer',destination:'base',asset,walletAddress:owner,destinationAddress:recipient,orderId,amount:'1',receive:'0.99',minimumReceive:'0.98',networkFee:'0.000125',fee:'0.010125',total:'1.000125',expiresAt:Date.now()+25000}
 const approval=value=>({to:token,value:'0x0',data:encodeFunctionData({abi,functionName:'approve',args:[depository,value]})})
 const calls=[approval(0n),approval(1000000n),{to:depository,value:'0x0',data:encodeFunctionData({abi,functionName:'depositErc20',args:[owner,token,1000000n,orderId]})},approval(0n),{to:token,value:'0x0',data:encodeFunctionData({abi,functionName:'transfer',args:[EVM_PLATFORM_TREASURY,125n]})}]
 const review={quote:q,quoteToken:'opaque',request:makeSponsoredBatchRequest({appId:'fixture',walletId:'fixturewallet123',attemptId:q.id,expiresAt:q.expiresAt,calls})}
 validateOutboundBridge(review,owner,recipient,asset,'1')
 let signed,dispatch=0,sends=0
 const deps={getAccessToken:async()=>'fixture',assertCurrent(){},sign:async request=>{signed=request;return {signature:'fixture'}},beforeDispatch(){dispatch++},fetcher:async(url,init)=>{sends++;assert.equal(dispatch,1);const b=JSON.parse(init.body);assert.equal(b.purpose,'bridge');assert.deepEqual(b.request,signed);return Response.json({ok:true,accepted:true,hash:null})}}
 await sendOutboundBridge(review,deps);assert.equal(sends,1)
 for(const mutate of [r=>r.quote.destinationAddress=owner,r=>r.quote.amount='2',r=>r.quote.networkFee='0',r=>r.quote.total='1',r=>r.quote.fee='0',r=>r.quote.expiresAt=0,r=>r.quote.orderId='0x'+'b'.repeat(64),r=>r.request.url='https://evil.invalid',r=>r.request.body.params.calls.pop(),r=>r.request.body.params.calls.reverse(),r=>r.request.body.params.calls[1].data=approval(2n**256n-1n).data,r=>r.request.body.params.calls[4].to=recipient]){
  const bad=structuredClone(review);mutate(bad);assert.throws(()=>validateOutboundBridge(bad,owner,recipient,asset,'1'),SponsoredTransferNotSubmitted)
 }
 await assert.rejects(()=>sendOutboundBridge(review,{...deps,sign:async()=>{throw Error('cancelled')}}),SponsoredTransferNotSubmitted)
 await assert.rejects(()=>sendOutboundBridge(review,{...deps,beforeDispatch(){throw Error('storage full')}}),SponsoredTransferNotSubmitted)
 await assert.rejects(()=>sendOutboundBridge(review,{...deps,assertCurrent(){throw Error('account changed')}}),SponsoredTransferNotSubmitted)
 await assert.rejects(()=>sendOutboundBridge(review,{...deps,beforeDispatch(){},fetcher:async()=>{throw Error('response lost')}}),e=>!(e instanceof SponsoredTransferNotSubmitted))
 assert.equal(sends,1)
}
console.log('PASS outbound client exact five-call validation, destination/asset/amount/fee binding, cancellation and account change, persistence before dispatch, accepted without hash, and uncertain network outcome. No funds moved.')
