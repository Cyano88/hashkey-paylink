import {createCrossBridgeCircleSettlement} from '../api/pocket/cross-bridge-circle-settlement.ts'
import {RELAY_BSC_CHAINS} from '../api/pocket/bsc-bridge-provider.ts'
import assert from 'node:assert/strict'
import {fixture,now} from './fixtures/cross-bridge.mjs'
import {validateCrossBridgeRelayQuote} from '../api/pocket/cross-bridge-provider.ts'
import {buildCrossBridgeChargedPlan} from '../api/pocket/cross-bridge-reimbursement.ts'
import {crossBridgeWalletFingerprint} from '../api/pocket/cross-bridge-wallets.ts'
import {createCrossBridgeReview,openCrossBridgeReview} from '../api/pocket/cross-bridge-review.ts'
import {createCrossBridgeCircleRuntime} from '../api/pocket/cross-bridge-circle-runtime.ts'
const secret='circle-cross-runtime-fixture-secret'.repeat(2),challengeId='11111111-1111-4111-8111-111111111111',sourceHash='0x'+'1'.repeat(64)
for(const source of ['ethereum','base','arbitrum','polygon','arc']){
 const {q,i}=fixture(source,source==='base'?'polygon':'base','USDC','USDT')
 const wallets={ownerId:'owner',source:{network:source,provider:'circle',walletId:'source',address:i.sender},destination:{network:i.destination,provider:'circle',walletId:'destination',address:i.recipient}}
 wallets.fingerprint=crossBridgeWalletFingerprint(wallets)
 const route=validateCrossBridgeRelayQuote(q,i,now),charged=await buildCrossBridgeChargedPlan(route,wallets,123n,'0x3333333333333333333333333333333333333333')
 const reviewed=await createCrossBridgeReview({wallets,input:i,providerQuote:q,appFee:null,reimbursementUnits:123n,reimbursementRecipient:'0x3333333333333333333333333333333333333333',...charged,expiresAt:now+30000},{secret,now})
 let time=now,rows=new Map(),sends=0,lookups=0,proofs=0,allowWallet=true,durable=true
 const store={read:async id=>structuredClone(rows.get(id)),mutate:async(id,fn)=>{const result=fn(structuredClone(rows.get(id)));rows.set(id,structuredClone(result));return structuredClone(result)}}
 const deps={store,now:()=>time,durable:()=>durable,open:(token,owner,options)=>openCrossBridgeReview(token,owner,{...options,secret}),wallets:async()=>{if(!allowWallet)throw Error('wallet changed')},approve:async()=>true,
 dispatch:async input=>{sends++;assert.equal(rows.get(reviewed.quote.id).state,'submitting');assert.equal(input.callData,charged.plan.callData);assert.equal(input.idempotencyKey,reviewed.quote.id);assert.equal(input.refId,'pocket:cross-bridge:'+reviewed.quote.id);throw Error('provider accepted but response lost')},
 recover:async input=>{lookups++;assert.equal(input.walletId,'source');return challengeId},
 transaction:async input=>{proofs++;assert.equal(input.callData,charged.plan.callData);assert.equal(input.challengeId,challengeId);return sourceHash}}
 const runtime=()=>createCrossBridgeCircleRuntime('owner','request-token',async()=>{},deps)
 const service=runtime();await service.prepare(reviewed.quoteToken,'pin');await Promise.all([service.submit(reviewed.quote.id),service.submit(reviewed.quote.id)])
 assert.equal(sends,1);assert.equal((await service.read(reviewed.quote.id)).state,'submitting')
 time+=90000
 const recovered=await runtime().status(reviewed.quote.id)
 assert.equal(recovered.state,'submitted');assert.equal(recovered.sourceHash,sourceHash);assert.equal(lookups,1)
 await runtime().status(reviewed.quote.id);assert.equal(lookups,1);assert.equal(proofs,2)
 await runtime().submit(reviewed.quote.id);assert.equal(sends,1)
 assert.equal((await runtime().cancel(reviewed.quote.id)).state,'submitted')
 assert(!JSON.stringify([...rows]).includes('request-token'))
 await assert.rejects(()=>createCrossBridgeCircleRuntime('other','request-token',async()=>{},deps).read(reviewed.quote.id))
 allowWallet=false;await runtime().status(reviewed.quote.id);assert.equal(proofs,2)
 let received=null,events=[],providerCalls=0
 const destinationHash='0x'+'2'.repeat(64)
 const reconcile=createCrossBridgeCircleSettlement({env:{RELAY_API_KEY:'test-key'},fetcher:async(url,init)=>{
  providerCalls++;assert.equal(init.redirect,'error');assert.equal(init.headers['x-api-key'],'test-key')
  const parsed=new URL(url);assert.equal(parsed.searchParams.get(parsed.pathname.includes('intents')?'requestId':'id'),route.requestId)
  const result=parsed.pathname.includes('intents')?{status:'success',originChainId:RELAY_BSC_CHAINS[source].id,destinationChainId:RELAY_BSC_CHAINS[i.destination].id,inTxHashes:[sourceHash],txHashes:[destinationHash]}:{requests:[{id:route.requestId,protocol:{orderId:route.orderId,hubType:'onchain'},status:'success',user:i.sender,recipient:i.recipient,data:{inTxs:[{txHash:sourceHash,chainId:RELAY_BSC_CHAINS[source].id,status:'success'}],outTxs:[{txHash:destinationHash,chainId:RELAY_BSC_CHAINS[i.destination].id,status:'success'}]}}]}
  return {ok:true,json:async()=>result}
 },overrides:{store,now:()=>time,open:(token,owner)=>openCrossBridgeReview(token,owner,{secret,now:time,recovery:true}),source:async()=> 'confirmed',received:async()=>received,ledger:async e=>events.push(e)}})
 assert.equal((await reconcile('owner',reviewed.quote.id)).state,'source_confirmed');assert.equal(events.length,0)
 received=BigInt(route.receiveUnits)
 assert.equal((await reconcile('owner',reviewed.quote.id)).state,'completed');assert.equal(events.length,1);assert.equal(events[0].asset,'USDT');assert.equal(events[0].metadata.destinationTxHash,destinationHash);assert.equal(providerCalls,4);assert.equal(sends,1)
 durable=false;assert.throws(()=>runtime().read(reviewed.quote.id),/unavailable/)
}
console.log('PASS Circle runtime: five source networks, exact fee-inclusive batch, durable claim before one dispatch, lost-response recovery after expiry, stable references, no repeated approval/dispatch, owner isolation, wallet change and storage guards. Mocked provider; no money moved.')
