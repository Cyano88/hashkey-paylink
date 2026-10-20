import assert from 'node:assert/strict'
import {createPocketActivityHandler} from '../api/pocket/activity.ts'
import {runPocketMoneyPushWorker} from '../api/pocket/money-push-worker.ts'
const now=Date.now(),hash='0x'+'a'.repeat(64),wallet='0x'+'1'.repeat(40)
for(const stable of ['USDC','USDT'])for(const state of ['submitted','failed','completed']){
 const record={id:'journal',ownerId:'owner',idempotencyKey:'pocket:native-swap:fixture',action:'wallet.native-swap',status:state,createdAt:now-30000,updatedAt:now-1000,metadata:{network:'base',walletAddress:wallet,assetSymbol:stable,toAsset:'ETH',amount:'1',amountOut:state==='completed'?'0.000485':undefined,feeAmount:'0.03',feeAsset:stable,txHash:hash}}
 let response;await createPocketActivityHandler({verifyUser:async()=>({userId:'owner'}),readHistory:async()=>({payments:[]}),readActions:async()=>[record]})({method:'GET',query:{}},{status(){return this},json(data){response=data;return this}})
 assert(response.ok);const row=response.payments.find(r=>r.eventId==='pocket-native-swap:journal');assert(row);assert.equal(row.amount,'1');assert.equal(row.assetSymbol,stable);assert.equal(row.feeAmount,state==='completed'?'0.03':undefined);assert.equal(row.feeAsset,state==='completed'?stable:undefined)
 if(state==='completed'){
  assert.match(row.contextLabel,/0.000485 ETH/)
  const raw=(asset,amount)=>({...row,eventId:asset+amount,source:'wallet-withdrawal',assetSymbol:asset,amount,recipient:'0x'+'2'.repeat(40)})
  const pushes=[];await runPocketMoneyPushWorker({configured:()=>true,listOwners:async()=>['owner'],listActions:async()=>[record],listRequests:async()=>[],readWallets:async()=>[],readActivity:async()=>[raw(stable,'0.97'),raw(stable,'0.03')],readContext:async()=>[row],sendPush:async(_owner,_event,push)=>pushes.push(push),now:()=>now});assert.equal(pushes.length,1,'one swap notification, no fee transfer notification');assert.match(pushes[0].body,/ETH/)
 }
}
console.log('PASS stable reimbursement Activity: total input and actual output retained, fee currency correct only on completion, one swap notice and no fee-leg noise')
