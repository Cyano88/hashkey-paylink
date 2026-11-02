import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Keypair} from '@solana/web3.js'
import {quoteCircleKitReview,openCircleKitReview,sealCircleKitReview} from '../api/pocket/circle-bridge-review.ts'
import {createCircleKitOperations} from '../api/pocket/circle-bridge-operations.ts'
const now=Date.now(),secret='fixture-secret-'.repeat(4),env={POCKET_SWAP_QUOTE_SECRET:secret,POCKET_BRIDGE_REVENUE_BPS:'10',POCKET_BRIDGE_REVENUE_EVM_ADDRESS:'0x3333333333333333333333333333333333333333',POCKET_BRIDGE_REVENUE_SOLANA_ADDRESS:Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey.toBase58()},wallets={ownerId:'fixture',fingerprint:'a'.repeat(64),source:{network:'base',provider:'circle',walletId:'source',address:'0x1111111111111111111111111111111111111111'},destination:{network:'arbitrum',provider:'circle',walletId:'dest',address:'0x2222222222222222222222222222222222222222'}},input={source:'base',destination:'arbitrum',walletAddress:wallets.source.address,destinationAddress:wallets.destination.address,transferUnits:1000000n,providerFeeUnits:200n,finalityThreshold:2000}
const result=await quoteCircleKitReview(input,wallets,{estimate:async()=> '0.000001',feeShares:async gross=>[gross*9n/10n,gross/10n],availableUnits:10000000n,nativeRateScaled8:200000000000n,providerExpiresAt:now+20000,now:()=>now},env)
assert.equal(result.quote.expiresAt,now+20000)
const baseDeps={estimate:async()=> '0.000001',feeShares:async gross=>[gross*9n/10n,gross/10n],availableUnits:10000000n,nativeRateScaled8:200000000000n,providerExpiresAt:now-1,now:()=>now}
await assert.rejects(()=>quoteCircleKitReview(input,wallets,baseDeps,env))
let lateClock=now
await assert.rejects(()=>quoteCircleKitReview(input,wallets,{...baseDeps,providerExpiresAt:now+20000,now:()=>lateClock,feeShares:async gross=>{lateClock+=20001;return [gross*9n/10n,gross/10n]}},env))
assert.equal((await openCircleKitReview(result.quoteToken,'fixture',{now,secret})).batch.totalUnits,result.batch.totalUnits)
await assert.rejects(()=>openCircleKitReview(result.quoteToken,'other',{now,secret}));await assert.rejects(()=>openCircleKitReview(result.quoteToken,'fixture',{now:now+60000,secret}));await openCircleKitReview(result.quoteToken,'fixture',{now:now+60000,secret,recovery:true})
for(const mutate of [q=>q.totalUnits='1',q=>q.callData+='00',q=>q.platformFee.amountUnits='9999',q=>q.platformFee.developerUnits=q.platformFee.amountUnits,q=>q.wallets.destination.address=wallets.source.address]){const bad=structuredClone(result.quote);mutate(bad);await assert.rejects(()=>openCircleKitReview(sealCircleKitReview(bad,secret),'fixture',{now,secret}))}
let store,clock=now,dispatches=0,recovery=null,failDispatch=true;let tail=Promise.resolve()
const d={now:()=>clock,open:(token,owner,recovery)=>openCircleKitReview(token,owner,{now:clock,recovery,secret}),read:async()=>structuredClone(store),mutate:fn=>{const next=tail.then(()=>{const copy=structuredClone(store);store=fn(copy)});tail=next.catch(()=>{});return next},approve:async(owner,approval)=>approval==='pin',preflight:async()=>{},dispatch:async()=>{dispatches++;if(failDispatch)throw Error('response lost');return {challengeId:'challenge-1'}},recover:async()=>recovery}
const service=createCircleKitOperations(d),prepared=await service.prepare(result.quoteToken,'fixture','pin');assert.equal(prepared.state,'prepared')
await Promise.all([service.submit(prepared.id,'fixture','private-user-token'),service.submit(prepared.id,'fixture','private-user-token')]);assert.equal(dispatches,1);assert.equal((await service.read(prepared.id,'fixture')).state,'submitting');assert.equal((await service.cancel(prepared.id,'fixture')).state,'submitting');assert.ok(!JSON.stringify(store).includes('private-user-token'))
clock=now+60000;const restarted=createCircleKitOperations(d);await restarted.resume(prepared.id,'fixture','session');await restarted.submit(prepared.id,'fixture','session');assert.equal(dispatches,1,'expiry/restart/background must not resubmit')
recovery={challengeId:'challenge-1',txHash:'0x'+'b'.repeat(64)};assert.equal((await restarted.resume(prepared.id,'fixture','session')).state,'pending');recovery={notSubmitted:true};assert.equal((await restarted.resume(prepared.id,'fixture','session')).state,'pending','hash prevents unsigned cancellation');await assert.rejects(()=>restarted.read(prepared.id,'other'))
recovery={txHash:'0x'+'c'.repeat(64)};await assert.rejects(()=>restarted.resume(prepared.id,'fixture','session'));assert.equal(dispatches,1)
// A second review cannot bypass a pending operation, even after its original quote expires.
const fresh=()=>{const q=structuredClone(result.quote);q.id=randomUUID();q.issuedAt=clock;q.expiresAt=clock+30000;return sealCircleKitReview(q,secret)}
await assert.rejects(()=>restarted.prepare(fresh(),'fixture','pin'),/previous bridge/)
await assert.rejects(()=>restarted.resume(prepared.id,'fixture',''))
// Cancellation wins if it occurs while submit is still doing preflight.
store=undefined;recovery=null;clock=now
const cancellable=await service.prepare(fresh(),'fixture','pin')
let release,entered;const enteredPromise=new Promise(resolve=>entered=resolve)
d.preflight=async()=>{entered();await new Promise(resolve=>release=resolve)}
const inFlight=service.submit(cancellable.id,'fixture','session');await enteredPromise
assert.equal((await service.cancel(cancellable.id,'fixture')).state,'cancelled');release()
assert.equal((await inFlight).state,'cancelled');assert.equal(dispatches,1)
d.preflight=async()=>{}
// Expired unsigned reviews can be replaced; signed/unknown ones above cannot.
const unsigned=await service.prepare(fresh(),'fixture','pin');clock+=30001
const replacement=await service.prepare(fresh(),'fixture','pin')
assert.equal((await service.read(unsigned.id,'fixture')).state,'cancelled');assert.equal(replacement.state,'prepared')
await service.cancel(replacement.id,'fixture');failDispatch=false
const success=await service.prepare(fresh(),'fixture','pin')
assert.equal((await service.submit(success.id,'fixture','session')).state,'pending');assert.equal(dispatches,2)
await service.submit(success.id,'fixture','session');assert.equal(dispatches,2)
console.log('PASS sealed Circle reviews, exact fee/batch/owner binding, expired recovery, durable single dispatch under concurrent calls, lost response/restart/late hash recovery, and no cancellation after dispatch. Fixtures only.')
import {createCircleKitRuntime} from '../api/pocket/circle-bridge-runtime.ts'
let runtimeStore,storageKey,ready=true,walletReads=0,providerCalls=0,found=null
const expectedOwner='fixture'
const runtimeOverrides={durable:()=>ready,now:()=>now,open:(token,owner,options)=>openCircleKitReview(token,owner,{...options,secret}),wallets:async binding=>{assert.equal(binding.ownerId,expectedOwner);walletReads++;return binding},read:async key=>{storageKey=key;return structuredClone(runtimeStore)},mutate:async(key,fn)=>{assert.equal(key,storageKey);runtimeStore=fn(structuredClone(runtimeStore))},approve:async(token,owner)=>{assert.equal(owner,expectedOwner);assert.equal(token,'approval-token');return true},dispatch:async args=>{providerCalls++;assert.equal(args.idempotencyKey,result.quote.id);assert.equal(args.refId,'pocket:bridge:'+result.quote.id);assert.equal(args.walletId,'source');assert.equal(args.walletAddress,wallets.source.address);assert.equal(args.callData,result.quote.callData);assert.equal(args.chain,'base');assert.equal(args.userToken,'session');throw Error('lost response')},transaction:async args=>{assert.equal(args.callData,result.quote.callData);return null},recover:async args=>{assert.equal(args.refId,'pocket:bridge:'+result.quote.id);assert.equal(args.walletId,'source');return found}}
let preflights=0
const runtime=createCircleKitRuntime(expectedOwner,async()=>{preflights++},runtimeOverrides)
assert.throws(()=>runtime.read(result.quote.id,'other'),/owner mismatch/)
ready=false;assert.throws(()=>runtime.prepare(result.quoteToken,expectedOwner,'approval-token'),/storage is unavailable/);assert.equal(providerCalls,0);ready=true
await runtime.prepare(result.quoteToken,expectedOwner,'approval-token');assert.match(storageKey,/^pocket:circle-kit-operations:v1:[0-9a-f]{64}$/)
assert.equal((await runtime.submit(result.quote.id,expectedOwner,'session')).state,'submitting');assert.equal(providerCalls,1);assert.equal(preflights,2);assert.equal(walletReads,3)
const restartedRuntime=createCircleKitRuntime(expectedOwner,async()=>{throw Error('Recovery must not reprice or dispatch')},runtimeOverrides)
assert.equal((await restartedRuntime.resume(result.quote.id,expectedOwner,'session')).state,'submitting');assert.equal(providerCalls,1)
found='challenge-1';assert.equal((await restartedRuntime.resume(result.quote.id,expectedOwner,'session')).state,'pending');await restartedRuntime.submit(result.quote.id,expectedOwner,'session');assert.equal(providerCalls,1)
assert.ok(!JSON.stringify(runtimeStore).includes('"session"'))
console.log('PASS Circle runtime adapter: durable-store required, owner-scoped keys, approval argument order, exact wallet/batch/reference/idempotency dispatch, wallet revalidation and read-only restart recovery. Injected provider/store fixtures only.')
