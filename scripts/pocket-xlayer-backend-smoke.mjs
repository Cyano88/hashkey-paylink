import assert from 'node:assert/strict'
import { encodeFunctionData, parseAbi } from 'viem'
import { createXLayerSponsorshipHandler } from '../api/pocket/xlayer-sponsorship.ts'
import { makeSponsoredRequest, SponsoredTransferNotSubmitted } from '../src/pocket/lib/pocketSponsoredRequest.ts'
import catalogue from '../src/pocket/lib/pocketXStocksCatalog.json' with { type:'json' }

const wallet='0x1111111111111111111111111111111111111111', recipient='0x2222222222222222222222222222222222222222'
const contract='0xB6CEceAB302E2E4948951eE7843FC24E92933061', walletId='fixturewalletid12345', hash='0x'+'a'.repeat(64)
const config={appId:'fixtureapp',secret:'server-only-fixture',enabled:true,wallets:[wallet]}
const now=Date.now(), abi=parseAbi(['function transfer(address,uint256) returns(bool)'])
const data=encodeFunctionData({abi,functionName:'transfer',args:[recipient,1000000n]})
const request=(id=crypto.randomUUID())=>makeSponsoredRequest({appId:config.appId,walletId,attemptId:id,expiresAt:now+90000,from:wallet,to:contract,data})
const body=(r=request())=>({action:'send',wallet,request:r,signature:'a'.repeat(88)})
function fixture(options={}) {
 let store, calls=0, queue=Promise.resolve(), sent
 const handler=createXLayerSponsorshipHandler({
  identity:async()=>({userId:'owner'}),config:()=>config,durable:()=>true,now:()=>now,
  user:async()=>({linkedAccounts:[{type:'wallet',walletClientType:'privy',chainType:'ethereum',address:wallet,id:walletId}]}),
  mutate:fn=>{const work=queue.then(()=>{store=fn(structuredClone(store));return structuredClone(store)});queue=work.catch(()=>{});return work},
  read:async()=>structuredClone(store),
  fetch:async(url,init)=>{calls++;sent={url,init};return new Response(JSON.stringify({data:{hash}}),{status:200})},
  ...options,
 })
 const call=async input=>{const result={status:200};const res={setHeader(){},status(n){result.status=n;return res},json(value){result.body=value;return res}};await handler({method:'POST',body:input},res);return result}
 return {call,get calls(){return calls},get sent(){return sent},get store(){return store}}
}
let f=fixture()
assert.equal((await f.call({action:'prepare',wallet})).body.walletId,walletId)
assert.equal(f.calls,0,'preflight never broadcasts')
const valid=body(), first=await f.call(valid)
assert.equal(first.body.hash,hash);assert.equal(f.calls,1)
assert.deepEqual(JSON.parse(f.sent.init.body),valid.request.body,'exact signed body relayed')
assert.equal(f.sent.init.headers['privy-authorization-signature'],valid.signature)
assert.equal(f.sent.init.headers['privy-request-expiry'],valid.request.headers['privy-request-expiry'])
assert.equal(f.sent.init.headers['privy-idempotency-key'],valid.request.headers['privy-idempotency-key'])
assert.equal(f.sent.init.headers.Authorization,'Basic '+Buffer.from('fixtureapp:server-only-fixture').toString('base64'))
assert.equal(JSON.stringify(first).includes(config.secret),false)
assert.equal((await f.call(valid)).body.hash,hash);assert.equal(f.calls,1,'duplicate never relayed twice')
assert.equal((await f.call({action:'status',wallet,attemptId:valid.request.headers['privy-idempotency-key']})).body.hash,hash,'lost response recovers by attempt ID without sending')
assert.equal(f.calls,1)
const expiredReplay=structuredClone(valid);expiredReplay.request.headers['privy-request-expiry']=String(now-1)
assert.equal((await f.call(expiredReplay)).body.code,'sponsor_outcome_unknown','invalid replay cannot claim an earlier payment was unsent')
for(const edit of [
 b=>b.request.body.params.transaction.data=encodeFunctionData({abi,functionName:'transfer',args:[recipient,999999n]}),
 b=>b.request.url='https://attacker.invalid/rpc',
 b=>b.request.body.caip2='eip155:1',
 b=>b.request.body.params.transaction.chain_id='0x1',
 b=>b.request.body.params.transaction.value='0x1',
 b=>b.request.body.params.transaction.to=recipient,
 b=>b.request.body.params.transaction.data='0x095ea7b3'+data.slice(10),
 b=>b.request.headers['privy-request-expiry']=String(now-1),
 b=>b.request.headers['privy-request-expiry']=String(now+180000),
 b=>b.request.body.authorization_list=[],
 b=>b.request.headers['privy-app-id']='different',
 b=>b.request.body.params.transaction.from=recipient,
 b=>b.signature='',
 b=>b.wallet=recipient,
]) {
 const bad=body();edit(bad);f=fixture();const r=await f.call(bad)
 assert.ok(r.status>=400);assert.equal(f.calls,0);assert.equal(r.body.code,'pocket_sponsor_not_submitted')
}
for(const options of [
 {config:()=>({...config,enabled:false})}, {durable:()=>false},
 {user:async()=>({linkedAccounts:[]})},
 {identity:async()=>{throw Object.assign(Error('Sign in again.'),{status:401})}},
]) {f=fixture(options);assert.ok((await f.call(body())).status>=400);assert.equal(f.calls,0)}
f=fixture();for(let i=0;i<10;i++)assert.equal((await f.call(body())).status,200)
assert.equal((await f.call(body())).status,429);assert.equal(f.calls,10,'durable per-wallet pilot cap enforced')
f=fixture();const concurrent=body();await Promise.all([f.call(concurrent),f.call(concurrent)]);assert.equal(f.calls,1,'atomic reservation handles concurrent sends')
let upstreamCalls=0
let minimumChecked=false
f=fixture({minimum:async()=>{minimumChecked=true;throw Error('Refresh the asset price before sending.')}})
const stockSend=body();stockSend.request.body.params.transaction.to=catalogue.assets[0].address
assert.equal((await f.call(stockSend)).status,422)
assert.equal(minimumChecked,true);assert.equal(f.calls,0,'fresh server stock valuation required before sponsorship')
f=fixture({fetch:async()=>{upstreamCalls++;throw Error('Timeout; secret '+config.secret)}})
const uncertain=body(), outcome=await f.call(uncertain)
assert.equal(outcome.body.code,'sponsor_outcome_unknown');assert.equal(JSON.stringify(outcome).includes(config.secret),false)
await f.call(uncertain);assert.equal(upstreamCalls,1,'unknown outcome stays reserved; no upstream retry')
f=fixture({fetch:async()=>new Response(JSON.stringify({code:'invalid_data',message:'App secret is required for gas sponsored transactions.'}),{status:400})})
assert.equal((await f.call(body())).body.code,'sponsor_outcome_unknown','generic provider errors do not unlock sends')
console.log('PASS isolated backend: ownership, payload, limits, duplicate prevention and unknown outcomes.');
let rejectedCalls=0;
f=fixture({fetch:async()=>{rejectedCalls++;return new Response(JSON.stringify({code:'transaction_broadcast_failure',message:'Provider failed '+config.secret+' Bearer hidden-token'}),{status:400,headers:{'x-request-id':'trace-fixture-123'}})}});
const rejectedPayment=body();
assert.equal((await f.call(rejectedPayment)).body.code,'pocket_sponsor_not_submitted');
assert.equal((await f.call(rejectedPayment)).body.code,'pocket_sponsor_not_submitted');
assert.equal((await f.call({action:'status',wallet,attemptId:rejectedPayment.request.headers['privy-idempotency-key']})).body.code,'pocket_sponsor_not_submitted');
assert.equal(rejectedCalls,1,'known rejection is never automatically resubmitted');
assert.equal(JSON.stringify(f.store).includes(config.secret),false);
assert.equal(JSON.stringify(f.store).includes('hidden-token'),false);
assert.equal(Object.values(f.store.requests)[0].providerFailure.requestId,'trace-fixture-123');
f=fixture({fetch:async()=>new Response(JSON.stringify({code:'transaction_broadcast_failure'}),{status:500})});
assert.equal((await f.call(body())).body.code,'sponsor_outcome_unknown','5xx must not be classified as a definitive rejection');
console.log('PASS exact broadcast rejection, status recovery, no resend, redacted diagnostics and unknown-error safety.');
let submits=0,lookups=0,ready=false;
const providerId='12345678-1234-4234-8234-123456789abc',operationHash='0x'+'b'.repeat(64);
f=fixture({fetch:async(url,init)=>{
 if(init.method==='POST'){submits++;return Response.json({data:{hash:'',transaction_id:providerId,user_operation_hash:operationHash,caip2:'eip155:196'}})}
 lookups++;assert.equal(url,'https://api.privy.io/v1/transactions/'+providerId);
 return Response.json({id:providerId,wallet_id:walletId,caip2:'eip155:196',user_operation_hash:operationHash,transaction_hash:ready?hash:null,status:ready?'confirmed':'pending'});
}});
const acceptedPayment=body(), acceptedResult=await f.call(acceptedPayment);
assert.equal(acceptedResult.status,202);assert.equal(acceptedResult.body.accepted,true);assert.equal(acceptedResult.body.hash,null);
const acceptedRecord=Object.values(f.store.requests)[0];assert.equal(acceptedRecord.transactionId,providerId);assert.equal(acceptedRecord.providerFailure,undefined);
await f.call(acceptedPayment);assert.equal(submits,1,'accepted operation cannot be broadcast twice');
ready=true;
assert.equal((await f.call({action:'status',wallet,attemptId:acceptedPayment.request.headers['privy-idempotency-key']})).body.hash,hash);
assert.equal(Object.values(f.store.requests)[0].hash,hash);assert.equal(submits,1);assert.equal(lookups,2);
for(const override of [{wallet_id:'wrong-wallet'},{caip2:'eip155:1'},{id:'different-provider-id'},{user_operation_hash:'0x'+'c'.repeat(64)}]){
 f=fixture({fetch:async(url,init)=>init.method==='POST'?Response.json({data:{hash:'',transaction_id:providerId,user_operation_hash:operationHash,caip2:'eip155:196'}}):Response.json({id:providerId,wallet_id:walletId,caip2:'eip155:196',user_operation_hash:operationHash,transaction_hash:hash,...override})});
 const payment=body();assert.equal((await f.call(payment)).body.hash,null);
 assert.equal((await f.call({action:'status',wallet,attemptId:payment.request.headers['privy-idempotency-key']})).body.hash,null);
 assert.equal(Object.values(f.store.requests)[0].hash,undefined);
}
console.log('PASS sponsored operation accepted before hash; durable recovery; exact wallet/network/operation binding; no duplicate broadcasts.');
