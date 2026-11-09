import assert from 'node:assert/strict'
import {privateKeyToAccount} from 'viem/accounts'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
import {walletTransferHash} from '../api/marketplace/wallet-execution.ts'
const wallet=privateKeyToAccount('0x'+'44'.repeat(32))
let outcome=null,failCommit=false,delivered=[]
let stored,queue=Promise.resolve(),now=1000000,preflight
const deps={verifyWalletOutcome:async()=>structuredClone(outcome),notifyMarketplace:async(projectId,type,data,event)=>{delivered.push({projectId,type,data,event});return {status:'sent',eventId:event.eventId,responseStatus:200}},now:()=>now,preflightWalletExecution:transfer=>preflight(transfer),read:async()=>structuredClone(stored),mutate:fn=>{const job=queue.then(()=>{const next=fn(structuredClone(stored||{books:[],drafts:[]}));if(failCommit)throw Error('fixture commit failure');stored=next;return structuredClone(next)});queue=job.catch(()=>{});return job}}
let repo=createMarketplaceRepository(deps)
const good=transfer=>({holdingId:'holding_one',holdingRevision:'revision_one',sender:'0x'+'22'.repeat(20),feePolicyId:'fee_policy_one',transferHash:walletTransferHash(transfer),expiresAt:now+60000,holdingApproved:true,authorizationActive:true,feesCoveredOutsideAllocation:true,additionalTokenDebitUnits:'0'})
async function reserved(asset,id){
 const beneficiaryId='wallet_'+id,paymentId='payment_'+id,operationId='operation_'+id
 const challenge=await repo.beginWalletVerification({projectId:'project_a',sellerId:'seller_a',beneficiaryId,asset,address:wallet.address})
 await repo.verifyWallet('project_a',beneficiaryId,challenge.nonce,await wallet.signMessage({message:challenge.message}))
 await repo.createWithVerifiedWallets({projectId:'project_a',paymentId,network:'base',asset,amount:'1.5',allocations:[{id:'share_a',sellerId:'seller_a',beneficiaryId,role:'seller',amount:'1.5',settlement:asset==='USDC'?'wallet_usdc':'wallet_usdt'}]},'draft_'+id)
 await repo.execute('project_a',paymentId,'fund_'+id,{type:'fund',evidenceId:'fixture:'+id,network:'base',asset,amountUnits:'1500000'})
 await repo.execute('project_a',paymentId,'release_'+id,{type:'release',allocationId:'share_a',amountUnits:'1500000'})
 await repo.walletPayouts.reserve('project_a',paymentId,'reserve_'+id,{operationId,allocationId:'share_a',amount:'1.5'},{credentialId:'credential_a',businessReference:'delivery_one'})
 return ['project_a',paymentId,operationId]
}
preflight=async transfer=>good(transfer)
async function submitted(asset,id){const refs=await reserved(asset,id),attempt=await repo.walletExecution.claim(...refs,'worker_a');await repo.walletExecution.beginSubmission(...refs,attempt.claimToken);return {refs,attempt:await repo.walletExecution.get(...refs),reservation:(await repo.get(...refs.slice(0,2))).walletReservations[0]}}
function proof(target,patch={}){const {refs,attempt:a,reservation:r}=target;return {projectId:refs[0],paymentId:refs[1],operationId:refs[2],attemptId:a.attemptId,holdingId:a.executionAuthorization.holdingId,holdingRevision:a.executionAuthorization.holdingRevision,transferHash:a.executionAuthorization.transferHash,chainId:8453,asset:r.asset,tokenAddress:r.tokenAddress,sender:a.executionAuthorization.sender,recipient:r.recipient,requestedUnits:r.amountUnits,transferredUnits:r.amountUnits,transactionHash:'0x'+(r.asset==='USDC'?'aa':'bb').repeat(32),blockHash:'0x'+'dd'.repeat(32),blockNumber:'100',logIndex:3,outcome:'transferred',finality:'finalized',finalizedAt:now,...patch}}
for(const asset of ['USDC','USDT']){
 const target=await submitted(asset,asset),reconcile=()=>repo.walletReconciliation.reconcile(...target.refs)
 outcome=null
 await assert.rejects(()=>createMarketplaceRepository({...deps,verifyWalletOutcome:undefined}).walletReconciliation.reconcile(...target.refs),/not configured/)
 assert.equal((await reconcile()).status,'unknown')
 for(const patch of [{projectId:'project_other'},{attemptId:'other_attempt'},{holdingRevision:'other_revision'},{transferHash:'other_hash'},{chainId:1},{asset:asset==='USDC'?'USDT':'USDC'},{tokenAddress:'0x'+'11'.repeat(20)},{sender:'0x'+'11'.repeat(20)},{recipient:'0x'+'11'.repeat(20)},{requestedUnits:'1499999'},{transferredUnits:'1499999'},{transferredUnits:'1500001'},{finality:'included'},{outcome:'pending'},{logIndex:-1},{logIndex:null},{blockNumber:'1e3'},{finalizedAt:now+1},{outcome:'reverted'}]){
  outcome=proof(target,patch);await assert.rejects(reconcile)
  assert.equal((await repo.get(...target.refs.slice(0,2))).balances[0].reserved,'1500000')
 }
 outcome=proof(target,{raw:'do-not-persist'})
 failCommit=true;await assert.rejects(reconcile,/commit failure/);failCommit=false
 assert.equal((await repo.get(...target.refs.slice(0,2))).walletEvents,undefined)
 const results=await Promise.all([reconcile(),reconcile()])
 assert.equal(results.filter(r=>r.changed).length,1)
 let book=await repo.get(...target.refs.slice(0,2))
 assert.equal(book.balances[0].paid,'1500000');assert.equal(book.balances[0].reserved,'0')
 assert.equal(book.walletEvents.length,1);assert.equal(book.walletReconciliations[0].evidence.raw,undefined)
 assert.match(book.walletReconciliations[0].evidence.evidenceId,/^base:8453:0x/)
 repo=createMarketplaceRepository(deps)
 assert.equal((await reconcile()).changed,false)
 await assert.rejects(()=>repo.walletExecution.markUncertain(...target.refs,target.attempt.claimToken),/does not match/)
 outcome=proof(target,{blockHash:'0x'+'cc'.repeat(32)})
 await assert.rejects(reconcile,/evidence was changed/)
 outcome=proof(target,{outcome:'reverted',transferredUnits:'0',logIndex:null})
 await assert.rejects(reconcile,/already final/)
 await repo.webhooks.deliver(target.refs[0],target.refs[1],book.walletEvents[0].id)
 const payload=delivered.at(-1).data
 assert.equal(payload.currency,asset);assert.equal(payload.asset,asset);assert.equal(payload.network,'base');assert.equal(payload.recipientAmountUnits,'1500000');assert.equal(payload.ngnPaidMinor,undefined)
}
const failed=await submitted('USDC','failed'),failReconcile=()=>repo.walletReconciliation.reconcile(...failed.refs)
outcome=proof(failed)
await assert.rejects(failReconcile,/already consumed|another payout/)
outcome=proof(failed,{transactionHash:'0x'+'cc'.repeat(32),outcome:'reverted',transferredUnits:'0',logIndex:null})
assert.equal((await failReconcile()).status,'failed')
const book=await repo.get(...failed.refs.slice(0,2))
assert.equal(book.balances[0].available,'1500000');assert.equal(book.balances[0].reserved,'0');assert.equal(book.balances[0].paid,'0')
assert.equal(book.walletEvents[0].recipientAmountUnits,'0')
assert.equal(JSON.stringify(stored).includes('do-not-persist'),false)
console.log('PASS wallet reconciliation: exact finalized transfer binding for both assets, partial/overpayment and provisional-proof rejection, canonical proof identity, atomic event/balance rollback, concurrent idempotency, restart, immutable terminal states, transaction reuse protection, reverted-funding recovery and wallet webhook amounts. Synthetic evidence; no RPC or signing calls.')
