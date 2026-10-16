import assert from 'node:assert/strict'
import {runPocketMoneyPushWorker} from '../api/pocket/money-push-worker.ts'
import {runPocketReconciliation} from '../api/pocket/reconciliation-worker.ts'
const now=2000000,hash='0x'+'a'.repeat(64),destinationTxHash='0x'+'b'.repeat(64)
const action={id:'bridge',ownerId:'owner',action:'wallet.xlayer-bridge',status:'submitted',metadata:{quoteToken:'signed',txHash:hash}}
for(const execution of ['circle','privy'])for(const state of ['pending','completed','refunded','needs_attention']){
 action.metadata.execution=execution
 let reconciled=false,calls=0;const pushes=[]
 const result=await runPocketMoneyPushWorker({configured:()=>true,listOwners:async()=>['owner'],readWallets:async()=>[],listActions:async()=>[action],listRequests:async()=>[],now:()=>now,
  readActivity:async()=>[{eventId:'raw',txHash:hash,chain:'base',amount:'1',assetSymbol:'USDC',ts:now,source:'wallet-withdrawal',paycrestStatus:'confirmed',direction:'out',recipient:'external'},{eventId:'raw-destination',txHash:destinationTxHash,chain:'xlayer',amount:'.98',assetSymbol:'USDC',ts:now,source:'wallet-deposit',paycrestStatus:'confirmed',direction:'in',payer:'external'}],
  readContext:async()=>[{eventId:'bridge',txHash:hash,destinationTxHash,chain:'base',destination:'xlayer',amount:'1',assetSymbol:'USDC',ts:now,source:'wallet-bridge',paycrestStatus:reconciled?state:'processing',direction:'out'}],
  [execution==='privy'?'reconcileXLayerOutbound':'reconcileXLayer']:async(owner,token)=>{assert.equal(owner,'owner');assert.equal(token,'signed');calls++;reconciled=true;return {ok:true,status:state,txHash:hash,destinationTxHash}},sendPush:async(owner,id,notice)=>pushes.push({owner,id,notice})})
 assert.equal(result.errors,0);assert.equal(calls,1)
 assert.equal(pushes.length,['completed','refunded'].includes(state)?1:0)
 if(state==='completed'){assert.equal(pushes[0].notice.title,'Bridge successful');assert.match(pushes[0].notice.body,/USDC bridged from Base to X Layer/)}
 if(state==='refunded')assert.equal(pushes[0].notice.title,'Refund completed')
 const recovered=[]
 const worker=await runPocketReconciliation({executions:{listUnresolved:async()=>[]},listBridges:async type=>type==='wallet.xlayer-bridge'?[action]:[],[execution==='privy'?'reconcileXLayerOutbound':'reconcileXLayer']:async(owner,token)=>{recovered.push([owner,token]);return {ok:true,status:state}},sendEmail:async()=>assert.fail('No operational email should be sent by this fixture'),now:()=>now})
 assert.deepEqual(recovered,[['owner','signed']]);assert.equal(worker.errors,0);assert.equal(worker.processed,1)
 assert.equal(worker.reconciled,['completed','refunded'].includes(state)?1:0);assert.equal(worker.review,state==='needs_attention'?1:0)
}
console.log('PASS X Layer background reconciliation and push wording; pending never announces success; bridge legs do not produce duplicate sent/received notices; refunds are distinct. Synthetic only.')
