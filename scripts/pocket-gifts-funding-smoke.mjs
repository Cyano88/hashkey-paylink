import assert from 'node:assert/strict'
import {createGiftDraftVault} from '../src/pocket/features/gifts/giftDraftVault.ts'
import {createGiftFundingFlow} from '../src/pocket/features/gifts/giftFundingController.ts'
const secrets=new Map(),index=new Map()
const secretStore={put:async(k,v)=>secrets.set(k,v),get:async k=>secrets.get(k)||null}
const indexStore={getItem:k=>index.get(k)||null,setItem:(k,v)=>index.set(k,v)}
const vault=createGiftDraftVault('one',secretStore,indexStore)
const draft=await vault.create('100','Enjoy')
assert.deepEqual(await vault.load(draft.requestId),draft)
assert(!JSON.stringify([...index.values()]).includes(draft.secret),'public index must not contain claim authority')
assert.deepEqual(createGiftDraftVault('two',secretStore,indexStore).list(),[])
await assert.rejects(()=>createGiftDraftVault('two',secretStore,indexStore).load(draft.requestId))
await assert.rejects(()=>createGiftDraftVault('broken',{put:async()=>{},get:async()=>null},indexStore).create('1',''),/securely save/)
let created=0,approved=0,saved=0,status='funding',prepareFail=false,storageFail=false
const deps={draft,save:async d=>{if(storageFail)throw Error('disk');saved++;await vault.save(d)},create:async d=>{created++;assert.equal(d.requestId,draft.requestId);return {id:'g_'+'a'.repeat(22),principal:'100000000',platformFee:'250000',totalDebit:'100250000'}},status:async()=>status,security:async()=>{},prepare:async()=>{if(prepareFail)throw Error('timeout');return {id:'approval',phase:'awaiting_approval'}},approve:async()=>{approved++},changed:()=>{}}
const flow=createGiftFundingFlow(deps)
await flow.review();assert.equal(flow.state.phase,'review')
storageFail=true;await flow.fund();assert.equal(approved,0,'never approve without durable credential update')
storageFail=false
// A storage interruption is conservatively status-checked; recover the saved draft with the same creation request.
const recovery=createGiftFundingFlow({...deps,draft:await vault.load(draft.requestId)})
await recovery.review();assert.equal(recovery.state.phase,'review')
await Promise.all([recovery.fund(),recovery.fund()]);assert.equal(approved,1);assert.equal(recovery.state.phase,'unconfirmed')
await recovery.fund();assert.equal(approved,1,'unknown result cannot fund again')
status='available';await recovery.recheck();assert.equal(recovery.state.phase,'available')
const mismatched=createGiftFundingFlow({...deps,create:async()=>({id:'g_'+'a'.repeat(22),principal:'1',platformFee:'0',totalDebit:'1'})});await mismatched.review();assert.equal(mismatched.state.phase,'draft')
console.log('PASS secure gift persistence, account isolation, read-back verification, exact fees, duplicate taps and interrupted funding recovery.')

status='funding'
let retryAllowed=false
const retry=createGiftFundingFlow({...deps,draft:{...draft,giftId:'g_'+'a'.repeat(22),approvalStarted:true},recoverFunding:async()=>({retryAllowed})})
await retry.review();assert.equal(retry.state.phase,'unconfirmed')
await retry.recheck();assert.equal(retry.state.phase,'unconfirmed')
retryAllowed=true;await retry.recheck();assert.equal(retry.state.phase,'review')
assert.equal((await vault.load(draft.requestId)).approvalStarted,false)
status='available';await retry.fund();assert.equal(retry.state.phase,'available')
console.log('PASS verified funding retry resets the durable marker only after server authorization.')

const expired=createGiftFundingFlow({...deps,draft:{...draft,expiresAt:'1'},create:async()=>{throw Error('Expired draft must not call funding')}})
await expired.review();assert.equal(expired.state.phase,'expired_unfunded')
status='expired_unfunded';const expiredSaved=createGiftFundingFlow({...deps,draft:{...draft,giftId:'g_'+'a'.repeat(22)}});await expiredSaved.review();assert.equal(expiredSaved.state.phase,'expired_unfunded')
let refundCalls=0;const noRefund=createGiftFundingFlow({...deps,prepareRefund:async()=>{refundCalls++;return {}}});await noRefund.review();await noRefund.refund();assert.equal(refundCalls,0)
console.log('PASS expired unfunded drafts: no funding or refund approval available.')

status='funding';let quietApprovals=0,quietReads=0;const quietStates=[]
const automatic=createGiftFundingFlow({...deps,draft:{...draft,giftId:'g_'+'a'.repeat(22),approvalStarted:true},status:async()=>{quietReads++;return status},approve:async()=>{quietApprovals++},changed:s=>quietStates.push(s)})
await automatic.review();quietStates.length=0;status='available';await Promise.all([automatic.refresh(),automatic.refresh()]);assert.equal(automatic.state.phase,'available');assert.equal(quietApprovals,0);assert(!quietStates.some(s=>s.phase==='checking'),'Quiet updates must not flicker into a loading state')
automatic.dispose();await automatic.refresh();assert.equal(quietApprovals,0)
console.log('PASS automatic funding confirmation updates quietly without replaying approval.')

const removable=createGiftDraftVault('cleanup',{...secretStore,remove:async k=>{secrets.delete(k)}},indexStore)
const localDraft=await removable.create('0.1','')
removable.archive(localDraft.requestId);assert(removable.archived().includes(localDraft.requestId));assert.equal((await removable.load(localDraft.requestId)).secret,localDraft.secret)
removable.restore(localDraft.requestId);assert.equal(removable.archived().length,0)
await removable.deleteDraft(localDraft.requestId);assert.equal(removable.list().length,0)
const protectedDraft=await removable.create('0.1','')
await removable.save({...protectedDraft,giftId:'g_'+'z'.repeat(22),approvalStarted:true})
await assert.rejects(removable.deleteDraft(protectedDraft.requestId,true));assert.equal(removable.list().length,1)
console.log('PASS archive preserves credentials and can restore; delete removes only safe unfunded drafts.')
