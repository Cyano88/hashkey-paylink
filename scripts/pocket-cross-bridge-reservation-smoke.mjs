import assert from 'node:assert/strict'
import {createCrossBridgeReservationStore,createCrossAwareXLayerMutator,crossBridgeJournalKey,CROSS_BRIDGE_BSC_KEYS,XLAYER_RESERVATION_KEY,assertNoCrossBridgeReservation} from '../api/pocket/cross-bridge-reservation.ts'
import {createBscOperationMutator} from '../api/pocket/bsc-operation-store.ts'
const wallet='0x'+'1'.repeat(40),keys=[crossBridgeJournalKey(),...CROSS_BRIDGE_BSC_KEYS,XLAYER_RESERVATION_KEY]
let db=new Map(),queue=Promise.resolve()
const transaction=fn=>{const task=queue.then(async()=>{const staged=structuredClone(db);let last=-1;const out=await fn({query:async(sql,args)=>{
 if(sql.startsWith('insert'))return{rows:[]}
 if(sql.startsWith('select')){const index=keys.indexOf(args[0]);assert(index>last,'fixed increasing lock order');last=index;return{rows:[{value:structuredClone(staged.get(args[0]))}]}}
 assert(sql.startsWith('update'));staged.set(args[0],JSON.parse(args[1]));return{rows:[]}
 }});db=staged;return out});queue=task.then(()=>undefined,()=>undefined);return task}
const cross=createCrossBridgeReservationStore(transaction,()=>1000),bsc=createBscOperationMutator(transaction,()=>1000),xlayer=createCrossAwareXLayerMutator(transaction,()=>1000)
const row=(id,source='bsc')=>({id,ownerId:'owner',source,walletAddress:wallet,fingerprint:id,expiresAt:2000,state:'prepared'})
const reserve=(id,source)=>cross.mutate(id,()=>row(id,source))
const bscAdd=s=>{s??={operations:{}};s.operations.old={state:'prepared',quote:{walletAddress:wallet,expiresAt:2000}};return s}
let outcomes=await Promise.allSettled([reserve('cross'),bsc(CROSS_BRIDGE_BSC_KEYS[0],bscAdd)])
assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1)
assert.equal(outcomes.filter(x=>x.status==='rejected'&&x.reason.code==='wallet_action_pending').length,1)
db=new Map();await bsc(CROSS_BRIDGE_BSC_KEYS[0],bscAdd);await assert.rejects(()=>reserve('cross'),e=>e.code==='wallet_action_pending')
await bsc(CROSS_BRIDGE_BSC_KEYS[0],s=>{s.operations.old.state='completed';return s});await reserve('cross')
await cross.mutate('cross',r=>({...r,state:'submitting',expiresAt:0}));await assert.rejects(()=>reserve('other'),e=>e.code==='wallet_action_pending')
await cross.mutate('cross',r=>({...r,state:'source_failed'}));await assert.rejects(()=>cross.mutate('cross',r=>({...r,state:'prepared'})))
await reserve('other')
db=new Map();outcomes=await Promise.allSettled([reserve('cross','xlayer'),xlayer(s=>({...s,requests:{...s?.requests,old:{wallet,owner:'owner',at:1000}}}))]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1)
db=new Map();await xlayer(()=>({requests:{old:{wallet,owner:'owner',at:1000}}}));await assert.rejects(()=>reserve('cross','xlayer'),e=>e.code==='wallet_action_pending')
await xlayer(s=>{s.requests.old.providerFailure={status:400,code:'transaction_broadcast_failure'};return s});await reserve('cross','xlayer')
await xlayer(s=>{s.requests.old.transactionId='recovery-reference';return s}) // Recovery cannot be frozen by another reservation.
const journal={crossBridge:{one:row('one','base')}}
assert.throws(()=>assertNoCrossBridgeReservation(journal,{network:'base',address:wallet},1000),e=>e.code==='wallet_action_pending')
assert.doesNotThrow(()=>assertNoCrossBridgeReservation(journal,{network:'arbitrum',address:wallet},1000))
db=new Map([[keys[0],{actions:{a:{ownerId:'owner',action:'wallet.native-send',status:'submitted',metadata:{source:'base',walletAddress:wallet}}}}]])
await assert.rejects(()=>reserve('cross','base'),e=>e.code==='wallet_action_pending')
db=new Map([[keys[0],{actions:{},circleKit:{old:{operations:{a:{state:'pending',quote:{wallets:{source:{network:'base',address:wallet}},expiresAt:0}}}}}}]])
await assert.rejects(()=>reserve('cross','base'),e=>e.code==='wallet_action_pending')
// Unresolved historical marketplace purchases are not wallet reservations.
const legacy={ownerId:'owner',action:'marketplace.service.purchase',status:'submitted',metadata:{network:'base',paymentState:'needs_review'}}
db=new Map([[keys[0],{actions:{legacy}}]])
await reserve('cross','base')
assert.deepEqual(db.get(keys[0]).actions.legacy,legacy)
for(const action of ['wallet.native-send','wallet.native-swap','wallet.bridge','reservation.direct-cctp']){
 db=new Map([[keys[0],{actions:{pending:{ownerId:'owner',action,status:'submitted',metadata:{network:'base'}}}}]])
 await assert.rejects(()=>reserve('cross','base'),e=>e.code==='wallet_action_pending')
}
console.log('PASS shared cross-asset locks: one winner against BSC/X Layer dispatch, existing unresolved operations block, recovery allowed, source-chain isolation, unknown outcomes never expire, rollback and terminal immutability. Serialized transaction fixture, not live DB contention.')

// Historical sends/swaps without a bridge journal entry can finish on chain.
const legacyRecord={wallet,owner:'owner',hash:'0x'+'a'.repeat(64),transactionId:'old-send'};
for(const proven of [false,true]){
 db=new Map([[XLAYER_RESERVATION_KEY,{requests:{old:legacyRecord}}]]);
 const verified=createCrossBridgeReservationStore(transaction,()=>1000,async()=>undefined,async()=>proven);
 const action=verified.mutate('new',()=>row('new','xlayer'));
 if(proven)await action;else await assert.rejects(action,e=>e.code==='wallet_action_pending');
 assert.deepEqual(db.get(XLAYER_RESERVATION_KEY).requests.old,legacyRecord,'Execution-lock check never changes payment evidence');
}
db=new Map([[XLAYER_RESERVATION_KEY,{requests:{old:{...legacyRecord,bridgeQuoteToken:'unresolved'}}}]]);
const verified=createCrossBridgeReservationStore(transaction,()=>1000,async()=>undefined,async()=>true);
await assert.rejects(()=>verified.mutate('new',()=>row('new','xlayer')),e=>e.code==='wallet_action_pending');
console.log('PASS legacy finality releases only proven non-bridge execution locks; unknown and pending bridge records still block');

// New requests atomically retire only expired, unsigned raw-Solana preparations.
const oldSol={...row('old','solana'),state:'pending',expiresAt:999,solanaTransaction:'unsigned-fixture',challengeId:'challenge'};
for(const patch of [{}, {signedTransaction:'signed'}, {sourceHash:'hash'}, {transactionId:'provider-id'}, {userOperationHash:'provider-hash'}, {expiresAt:1001}, {state:'submitted'}, {solanaTransaction:undefined}]){
 const old={...oldSol,...patch};db=new Map([[keys[0],{crossBridge:{old}}]]);
 if(Object.keys(patch).length)await assert.rejects(()=>reserve('new','solana'),e=>e.code==='wallet_action_pending');
 else {await reserve('new','solana');assert.equal(db.get(keys[0]).crossBridge.old.state,'cancelled');await assert.rejects(()=>cross.mutate('old',r=>({...r,state:'submitted',signedTransaction:'late'})));}
}
db=new Map([[keys[0],{crossBridge:{old:oldSol},actions:{block:{ownerId:'owner',action:'wallet.native-send',status:'submitted',metadata:{source:'solana'}}}}]]);
await assert.rejects(()=>reserve('new','solana'));assert.equal(db.get(keys[0]).crossBridge.old.state,'pending','failed replacement rolls back retirement');
for(const source of ['base','arc','ethereum','arbitrum','polygon']){db=new Map([[keys[0],{crossBridge:{old:{...oldSol,source}}}]]);await assert.rejects(()=>reserve('new',source),e=>e.code==='wallet_action_pending');}
console.log('PASS expired unsigned Solana replacement; signed, submitted, unexpired and EVM protected; terminal late write rejected; rollback atomic');
