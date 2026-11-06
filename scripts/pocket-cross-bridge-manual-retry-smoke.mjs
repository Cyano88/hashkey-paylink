import assert from 'node:assert/strict'
import {manualBridgeRetry,bindManualBridgeRetry,retryScope} from '../api/pocket/cross-bridge-manual-retry.ts'
import {assertNoCrossBridgeReservation} from '../api/pocket/cross-bridge-reservation-guard.ts'
import {createCrossBridgeReservationStore,crossBridgeJournalKey,CROSS_BRIDGE_BSC_KEYS,XLAYER_RESERVATION_KEY} from '../api/pocket/cross-bridge-reservation.ts'
const now=100000,wallet='0x'+'1'.repeat(40),encode=q=>Buffer.from(JSON.stringify(q)).toString('base64url')+'.fixture'
const quote=(id,amount='200000000000000000',total='230000000000000000')=>({id,ownerId:'owner',input:{source:'bsc',destination:'arbitrum',from:'USDC',to:'USDC',amountUnits:amount},wallets:{source:{address:wallet}},totalUnits:total})
const old={id:'old',ownerId:'owner',source:'bsc',walletAddress:wallet,state:'submitting',expiresAt:100,fingerprint:'old',quoteToken:encode(quote('old','65517956571123630','94350214389091603'))}
const grant={authorizedAt:now-1000,expiresAt:now+600000,reason:'owner_accepted_duplicate_execution_risk',ownerId:'owner',walletAddress:wallet,source:'bsc',destination:'arbitrum',from:'USDC',to:'USDC',maximumAmountUnits:'200000000000000000',maximumTotalUnits:'300000000000000000'}
const fixture=()=>({crossBridge:{old:structuredClone(old)},manualBridgeRetries:{old:structuredClone(grant)}})
const scope=retryScope(quote('new'));let j=fixture()
assert.equal(manualBridgeRetry(j,scope,now).reservedUnits,94350214389091603n)
for(const changed of [{ownerId:'other'},{walletAddress:'0x'+'2'.repeat(40)},{source:'xlayer'},{from:'USDT'},{destination:'base'},{to:'USDT'},{amountUnits:'200000000000000001'},{totalUnits:'300000000000000001'}])assert.equal(manualBridgeRetry(j,{...scope,...changed},now),undefined)
assert.equal(manualBridgeRetry(j,scope,grant.expiresAt),undefined)
assert.equal(manualBridgeRetry(j,scope,grant.authorizedAt-1),undefined)
assert.throws(()=>assertNoCrossBridgeReservation(j,{network:'bsc',address:wallet},now),e=>e.code==='wallet_action_pending','ordinary swaps/sends retain original lock')
for(const field of ['sourceHash','transactionId','userOperationHash','challengeId']){const copy=fixture();copy.crossBridge.old[field]='discovered';assert.equal(manualBridgeRetry(copy,scope,now),undefined)}
const next={id:'new',ownerId:'owner',source:'bsc',walletAddress:wallet,state:'prepared',expiresAt:now+40000,fingerprint:'new',quoteToken:encode(quote('new'))}
const except=bindManualBridgeRetry(j,next,now);assert.equal(except,'old');assert.equal(j.manualBridgeRetries.old.retryId,'new');assert.equal(j.manualBridgeRetries.old.usedAt,undefined);assert.deepEqual(j.crossBridge.old,old)
j.crossBridge.new=next
assert.equal(manualBridgeRetry(j,{...scope,id:'other'},now),undefined)
assert.doesNotThrow(()=>assertNoCrossBridgeReservation(j,{network:'bsc',address:wallet},now,'new',except))
bindManualBridgeRetry(j,{...next,state:'submitting'},now);assert.equal(j.manualBridgeRetries.old.usedAt,now)
j.crossBridge.new={...next,state:'completed'};assert.equal(manualBridgeRetry(j,{...scope,id:'second'},now),undefined,'consumed grant never allows a second dispatch')
j=fixture();bindManualBridgeRetry(j,next,now);j.crossBridge.new={...next,state:'cancelled'};assert(manualBridgeRetry(j,{...scope,id:'replacement'},now),'unsigned cancellation can obtain a fresh quote')
// Exercise the actual shared lock and atomic grant binding, not only the helper.
const keys=[crossBridgeJournalKey(),...CROSS_BRIDGE_BSC_KEYS,XLAYER_RESERVATION_KEY];let db=new Map([[keys[0],fixture()]]),queue=Promise.resolve()
const transaction=fn=>{const task=queue.then(async()=>{const stage=structuredClone(db);const result=await fn({query:async(sql,args)=>{if(sql.startsWith('insert'))return{rows:[]};if(sql.startsWith('select'))return{rows:[{value:structuredClone(stage.get(args[0]))}]};stage.set(args[0],JSON.parse(args[1]));return{rows:[]}}});db=stage;return result});queue=task.catch(()=>{});return task}
const store=createCrossBridgeReservationStore(transaction,()=>now,async()=>db.get(keys[0]))
const contender={...next,id:'other',fingerprint:'other',quoteToken:encode(quote('other'))}
const results=await Promise.allSettled([store.mutate('new',()=>next),store.mutate('other',()=>contender)])
assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
const winner=results[0].status==='fulfilled'?'new':'other'
await store.mutate(winner,r=>({...r,state:'submitting'}));assert.equal(db.get(keys[0]).manualBridgeRetries.old.retryId,winner);assert.equal(db.get(keys[0]).manualBridgeRetries.old.usedAt,now);assert.deepEqual(db.get(keys[0]).crossBridge.old,old)
await assert.rejects(()=>store.mutate('third',()=>({...next,id:'third',fingerprint:'third',quoteToken:encode(quote('third'))})),e=>e.code==='wallet_action_pending')
console.log('PASS one-time manual retry: owner/wallet/route/asset/amount/fee caps, expiry, no original evidence mutation, ordinary lock retained, atomic concurrent single winner, consumed permit and unsigned recovery. No live payment.')
