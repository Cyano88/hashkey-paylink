import assert from 'node:assert/strict'
import {Keypair} from '@solana/web3.js'
import {fixture,now} from './fixtures/cross-bridge.mjs'
import {CROSS_BRIDGE_ROLLOUT_NETWORKS,crossBridgeAssets} from '../src/pocket/lib/pocketCrossBridgeAssets.ts'
import {validateCrossBridgeRelayQuote} from '../api/pocket/cross-bridge-provider.ts'
import {buildCrossBridgeChargedPlan} from '../api/pocket/cross-bridge-reimbursement.ts'
import {crossBridgeWalletFingerprint} from '../api/pocket/cross-bridge-wallets.ts'
import {createCrossBridgeReview,openCrossBridgeReview,sealCrossBridgeReview} from '../api/pocket/cross-bridge-review.ts'
import {createCrossBridgeOperations} from '../api/pocket/cross-bridge-operations.ts'
import {createCrossBridgeReservationStore,crossBridgeJournalKey,CROSS_BRIDGE_BSC_KEYS,XLAYER_RESERVATION_KEY} from '../api/pocket/cross-bridge-reservation.ts'
const secret='fixture-cross-review-secret-'.repeat(3),treasury='0x3333333333333333333333333333333333333333',solTreasury=Keypair.fromSeed(new Uint8Array(32).fill(7)).publicKey.toBase58()
let reviews=[]
for(const source of CROSS_BRIDGE_ROLLOUT_NETWORKS)for(const asset of crossBridgeAssets(source)){
 const destination=source==='base'?'polygon':'base',{q,i}=fixture(source,destination,asset.symbol,'USDC'),route=validateCrossBridgeRelayQuote(q,i,now)
 const wallets={ownerId:'owner',source:{network:source,provider:['bsc','xlayer'].includes(source)?'privy':'circle',walletId:'source',address:i.sender},destination:{network:destination,provider:'circle',walletId:'dest',address:i.recipient}};wallets.fingerprint=crossBridgeWalletFingerprint(wallets)
 const recipient=source==='solana'?solTreasury:treasury,charged=await buildCrossBridgeChargedPlan(route,wallets,123n,recipient)
 const result=await createCrossBridgeReview({wallets,input:i,providerQuote:q,appFee:null,reimbursementUnits:123n,reimbursementRecipient:recipient,...charged,expiresAt:now+30000},{secret,now})
 const stored=JSON.parse(JSON.stringify(result)),opened=await openCrossBridgeReview(stored.quoteToken,'owner',{secret,now})
 assert.equal(opened.charged.planHash,charged.planHash);assert.equal(opened.charged.totalUnits,charged.totalUnits)
 if(source==='solana'){assert.equal(typeof opened.charged.plan.instructions[0].programId.toBase58,'function');assert.equal(Buffer.isBuffer(opened.charged.plan.instructions[0].data),true)}
 await assert.rejects(()=>openCrossBridgeReview(stored.quoteToken,'other',{secret,now}))
 await assert.rejects(()=>openCrossBridgeReview(stored.quoteToken,'owner',{secret,now:now+30001}))
 assert.equal((await openCrossBridgeReview(stored.quoteToken,'owner',{secret,now:now+999999,recovery:true})).charged.planHash,charged.planHash)
 reviews.push(result)
}
const review=reviews.find(r=>r.quote.input.source==='bsc'&&r.quote.input.from==='BNB')
for(const mutate of [q=>q.planHash='0'.repeat(64),q=>q.totalUnits='1',q=>q.reimbursementUnits='0',q=>q.wallets.source.walletId='changed',q=>q.input.recipient=treasury,q=>q.providerQuote.details.currencyOut.amount='1']){
 const q=structuredClone(review.quote);mutate(q);await assert.rejects(()=>openCrossBridgeReview(sealCrossBridgeReview(q,secret),'owner',{secret,now}))
}
await assert.rejects(()=>openCrossBridgeReview(review.quoteToken.slice(0,-3)+'aaa','owner',{secret,now}))
const keys=[crossBridgeJournalKey(),...CROSS_BRIDGE_BSC_KEYS,XLAYER_RESERVATION_KEY]
function harness(){let db=new Map(),queue=Promise.resolve(),time=now,dispatches=0,observations=0,dispatchResult={transactionId:'provider-tx'},observeResult=null,throws=false
 const transaction=fn=>{const task=queue.then(async()=>{const stage=structuredClone(db);let last=-1;const out=await fn({query:async(sql,args)=>{if(sql.startsWith('insert'))return{rows:[]};if(sql.startsWith('select')){const index=keys.indexOf(args[0]);assert(index>last);last=index;return{rows:[{value:structuredClone(stage.get(args[0]))}]}}assert(sql.startsWith('update'));stage.set(args[0],JSON.parse(args[1]));return{rows:[]}}});db=stage;return out});queue=task.then(()=>undefined,()=>undefined);return task}
 const store=createCrossBridgeReservationStore(transaction,()=>time,async()=>structuredClone(db.get(keys[0])))
 const deps={store,now:()=>time,open:(token,owner,recovery)=>openCrossBridgeReview(token,owner,{secret,now:time,recovery}),approve:async()=>true,preflight:async()=>{},dispatch:async(review,op,authorization)=>{dispatches++;assert.equal(op.id,review.quote.id);assert.equal(op.state,'submitting');assert.equal((await store.read(op.id)).state,'submitting');assert.equal(authorization,'ephemeral');if(throws)throw Error('timeout after request');return dispatchResult},observe:async()=>{observations++;return observeResult}}
 return {store,deps,service:createCrossBridgeOperations(deps),time:v=>time=v,throw:()=>throws=true,result:v=>observeResult=v,counts:()=>[dispatches,observations],dump:()=>JSON.stringify([...db])}
}
const id=review.quote.id
let h=harness();await h.service.prepare(review.quoteToken,'owner','approval');await Promise.all([h.service.submit('owner',id,'ephemeral'),h.service.submit('owner',id,'ephemeral')]);assert.equal(h.counts()[0],1);assert.equal((await h.service.read('owner',id)).state,'pending');assert.equal(h.dump().includes('ephemeral'),false)
assert.equal((await h.service.cancel('owner',id)).state,'pending');await assert.rejects(()=>h.service.read('other',id));
h.result({sourceHash:'0x'+'1'.repeat(64)});h.time(now+90000);const recovered=await createCrossBridgeOperations(h.deps).status('owner',id);assert.equal(recovered.state,'submitted');await h.service.submit('owner',id,'ephemeral');assert.equal(h.counts()[0],1)
h.result({sourceHash:'0x'+'2'.repeat(64)});await assert.rejects(()=>h.service.status('owner',id),/reference changed/);assert.equal((await h.service.read('owner',id)).sourceHash,recovered.sourceHash)
h=harness();await h.service.prepare(review.quoteToken,'owner','approval');h.throw();await h.service.submit('owner',id,'ephemeral');h.time(now+90000);await h.service.submit('owner',id,'ephemeral');assert.equal((await h.service.status('owner',id)).state,'submitting');assert.equal(h.counts()[0],1)
h.result({definitelyNotSubmitted:true});assert.equal((await h.service.status('owner',id)).state,'not_submitted');assert.equal((await h.service.submit('owner',id,'ephemeral')).state,'not_submitted');assert.equal(h.counts()[0],1)
h=harness();await h.service.prepare(review.quoteToken,'owner','approval');await h.service.cancel('owner',id);await h.service.submit('owner',id,'ephemeral');assert.equal(h.counts()[0],0)
h=harness();await h.service.prepare(review.quoteToken,'owner','approval');h.time(now+30000);await assert.rejects(()=>h.service.submit('owner',id,'ephemeral'));assert.equal(h.counts()[0],0)
console.log('PASS '+reviews.length+' JSON-safe signed reviews including rebuilt Solana instructions; tamper/owner/expiry checks; shared-journal atomic submit, timeout/restart recovery, immutable references, cancellation, no stored credentials and no duplicate dispatch. Transaction fixture, no live payment.')

// Settlement must mutate the same JSON operation and repair ledger writes after restart.
const {createCrossBridgeJournalSettlement}=await import('../api/pocket/cross-bridge-journal-settlement.ts')
const {RELAY_BSC_CHAINS}=await import('../api/pocket/bsc-bridge-provider.ts')
h=harness();await h.service.prepare(review.quoteToken,'owner','approval');await h.service.submit('owner',id,'ephemeral');const sourceHash='0x'+'1'.repeat(64),destinationHash='0x'+'2'.repeat(64);h.result({sourceHash});await h.service.status('owner',id)
const opened=await openCrossBridgeReview(review.quoteToken,'owner',{secret,now,recovery:true}),q=opened.route
let sourceCalls=0,ledgerFailures=1;const events=new Map()
const reconcile=createCrossBridgeJournalSettlement({store:h.store,now:()=>now+100000,open:(token,owner)=>openCrossBridgeReview(token,owner,{secret,now:now+100000,recovery:true}),source:async(record,saved)=>{sourceCalls++;assert.equal(saved.charged.planHash,review.quote.planHash);assert.equal(record.sourceHash,sourceHash);return 'confirmed'},provider:async()=>({status:{status:'success',originChainId:RELAY_BSC_CHAINS[q.source].id,destinationChainId:RELAY_BSC_CHAINS[q.destination].id,inTxHashes:[sourceHash],txHashes:[destinationHash]},requests:{requests:[{id:q.requestId,protocol:{orderId:q.orderId,hubType:'onchain'},status:'success',user:review.quote.input.sender,recipient:review.quote.input.recipient,data:{inTxs:[{txHash:sourceHash,chainId:RELAY_BSC_CHAINS[q.source].id,status:'success'}],outTxs:[{txHash:destinationHash,chainId:RELAY_BSC_CHAINS[q.destination].id,status:'success'}]}}]}}),received:async()=>BigInt(q.receiveUnits),ledger:async event=>{if(ledgerFailures-->0)throw Error('ledger temporarily unavailable');events.set(event.eventKey,event)}})
await assert.rejects(()=>reconcile('other',id));assert.equal(sourceCalls,0)
await assert.rejects(()=>reconcile('owner',id),/ledger temporarily/);assert.equal((await h.service.read('owner',id)).state,'completed');assert.equal(events.size,0)
await reconcile('owner',id);assert.equal(events.size,1);assert.equal(sourceCalls,1);assert.equal([...events.values()][0].asset,'USDC');assert.equal([...events.values()][0].metadata.sourceAsset,'BNB');assert.equal(h.counts()[0],1);assert.doesNotThrow(()=>JSON.parse(h.dump()));assert.equal((await h.service.read('owner',id)).settlement.hash,destinationHash)
console.log('PASS shared-journal settlement and post-restart ledger repair: one operation, no duplicate dispatch, original charged plan retained, actual output asset recorded. Injected proof fixtures only.')
