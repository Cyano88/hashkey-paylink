import assert from 'node:assert/strict'
import {encodeFunctionData,parseAbi} from 'viem'
import {quoteSponsoredStablecoin,sendSponsoredStablecoin,validateSponsoredStablecoinQuote} from '../src/pocket/api/pocketSponsoredStablecoin.ts'
import {makeSponsoredBatchRequest,SponsoredTransferNotSubmitted} from '../src/pocket/lib/pocketSponsoredRequest.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
const owner='0x1111111111111111111111111111111111111111',recipient='0x2222222222222222222222222222222222222222',hash='0x'+'a'.repeat(64)
const abi=parseAbi(['function transfer(address,uint256) returns(bool)'])
for(const [asset,token] of [['USDC','0xb6ceceab302e2e4948951ee7843fc24e92933061'],['USDT','0x779ded0c9e1022225f8e0630b35a9b54be713736']]){
 let signed,sends=0
 const deps={getAccessToken:async()=>'fixture',assertCurrent(){},sign:async request=>{signed=structuredClone(request);return {signature:'fixture'}},fetcher:async(url,init)=>{
  const body=JSON.parse(init.body)
  if(body.action==='quote'){
   const expiresAt=Date.now()+25000,calls=[{to:token,data:encodeFunctionData({abi,functionName:'transfer',args:[recipient,1000000n]}),value:'0x0'},{to:token,data:encodeFunctionData({abi,functionName:'transfer',args:[EVM_PLATFORM_TREASURY,125n]}),value:'0x0'}]
   return Response.json({ok:true,quoteToken:'opaque-server-quote',feeUnits:'125',totalUnits:'1000125',expiresAt,request:makeSponsoredBatchRequest({appId:'fixture',walletId:'fixturewallet123',attemptId:body.attemptId,expiresAt,calls})})
  }
  sends++;assert.deepEqual(body.request,signed);assert.equal(body.quoteToken,'opaque-server-quote');assert.equal(body.intent.asset,asset);return Response.json({ok:true,hash})
 }}
 const q=await quoteSponsoredStablecoin(owner,{asset,recipient,amountUnits:'1000000'},deps)
 await assert.rejects(()=>quoteSponsoredStablecoin(owner,{asset,recipient,amountUnits:'1000000'},{...deps,fetcher:async()=>{throw Error('timeout')}}),SponsoredTransferNotSubmitted)
 assert.equal(q.feeUnits,'125');assert.equal(sends,0)
 assert.equal((await sendSponsoredStablecoin(q,deps)).hash,hash);assert.equal(sends,1)
 for(const mutate of [q=>q.request.url='https://evil.invalid',q=>q.request.body.params.calls.pop(),q=>q.request.body.params.calls.reverse(),q=>q.request.body.params.calls[1].to=recipient,q=>q.totalUnits='1000000',q=>q.feeUnits='0',q=>q.intent.recipient=owner,q=>q.expiresAt=Date.now()-1,q=>q.request.body.sponsor=false,q=>q.request.headers.extra='bad']){
  const bad=structuredClone(q);mutate(bad);assert.throws(()=>validateSponsoredStablecoinQuote(bad),SponsoredTransferNotSubmitted)
  await assert.rejects(()=>sendSponsoredStablecoin(bad,deps),SponsoredTransferNotSubmitted);assert.equal(sends,1)
 }
 await assert.rejects(()=>sendSponsoredStablecoin(q,{...deps,sign:async()=>{throw Error('cancelled')}}),SponsoredTransferNotSubmitted)
 await assert.rejects(()=>sendSponsoredStablecoin(q,{...deps,assertCurrent(){throw Error('changed account')}}),SponsoredTransferNotSubmitted)
 await assert.rejects(()=>sendSponsoredStablecoin(q,{...deps,fetcher:async()=>{throw Error('lost response')}}),e=>!(e instanceof SponsoredTransferNotSubmitted))
}
const storage=new Map();globalThis.localStorage={get length(){return storage.size},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}
const {runStockSubmission,readStockAttempts}=await import('../src/pocket/lib/pocketStockSubmission.ts')
const attemptId=crypto.randomUUID()
await runStockSubmission({key:'fixture',kind:'send',sponsored:true,attemptId,send:async id=>{assert.equal(id,attemptId);return {hash}},wait:async()=>({status:'success'}),onPending(){},onUncertain(){}})
assert.equal(readStockAttempts('fixture')[0].id,attemptId)
await assert.rejects(()=>runStockSubmission({key:'fixture',kind:'send',sponsored:true,attemptId,send:async()=>{assert.fail('must not resend')},onPending(){},onUncertain(){}}),SponsoredTransferNotSubmitted)
console.log('PASS USDC/USDT reviewed batch binding, fee/total/treasury validation, cancellation, account change, lost response, and quote attempt recovery. No funds moved.')
