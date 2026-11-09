import assert from 'node:assert/strict'
import {privateKeyToAccount} from 'viem/accounts'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
import {walletTransferHash} from '../api/marketplace/wallet-execution.ts'
const wallet=privateKeyToAccount('0x'+'44'.repeat(32))
let stored,queue=Promise.resolve(),now=1000000,preflight
const deps={now:()=>now,preflightWalletExecution:transfer=>preflight(transfer),read:async()=>structuredClone(stored),mutate:fn=>{const job=queue.then(()=>{const next=fn(structuredClone(stored||{books:[],drafts:[]}));stored=next;return structuredClone(next)});queue=job.catch(()=>{});return job}}
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
for(const asset of ['USDC','USDT']){
 const refs=await reserved(asset,asset)
 await assert.rejects(()=>repo.walletExecution.claim('project_other',refs[1],refs[2],'worker_a'),/not found/)
 const results=await Promise.allSettled(['worker_a','worker_b'].map(w=>repo.walletExecution.claim(...refs,w)))
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
 const old=results.find(r=>r.status==='fulfilled').value
 await assert.rejects(()=>createMarketplaceRepository({...deps,preflightWalletExecution:undefined}).walletExecution.beginSubmission(...refs,old.claimToken),/not configured/)
 now+=31000
 const claim=await repo.walletExecution.claim(...refs,'worker_c')
 await assert.rejects(()=>repo.walletExecution.beginSubmission(...refs,old.claimToken),/expired/)
 for(const patch of [{holdingApproved:false},{authorizationActive:false},{feesCoveredOutsideAllocation:false},{additionalTokenDebitUnits:'1'},{transferHash:'different_hash'},{expiresAt:now+5000},{sender:wallet.address},{sender:'0x'+'00'.repeat(20)}]){
  preflight=async transfer=>({...good(transfer),...patch})
  await assert.rejects(()=>repo.walletExecution.beginSubmission(...refs,claim.claimToken))
 }
 preflight=async transfer=>{now+=5001;return good(transfer)}
 await assert.rejects(()=>repo.walletExecution.beginSubmission(...refs,claim.claimToken),/stale/)
 preflight=async transfer=>good(transfer)
 const concurrent=await Promise.allSettled([1,2].map(()=>repo.walletExecution.beginSubmission(...refs,claim.claimToken)))
 assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1)
 const handoff=concurrent.find(r=>r.status==='fulfilled').value
 assert.equal(handoff.transfer.asset,asset);assert.equal(handoff.attempt.executionAuthorization.transferHash,walletTransferHash(handoff.transfer))
 assert.equal(handoff.attempt.submitBefore,now+5000)
 assert.equal((await repo.get(...refs.slice(0,2))).operations[0].status,'unknown')
 repo=createMarketplaceRepository(deps);now+=31000
 await assert.rejects(()=>repo.walletExecution.claim(...refs,'worker_restart'),/reconciliation/)
 await assert.rejects(()=>repo.walletExecution.beginSubmission(...refs,claim.claimToken),/already used/)
 await repo.walletExecution.markUncertain(...refs,claim.claimToken)
 const hash='0x'+(asset==='USDC'?'aa':'bb').repeat(32)
 if(asset==='USDT')await assert.rejects(()=>repo.walletExecution.recordSubmission(...refs,claim.claimToken,'0x'+'aa'.repeat(32)),/another payout/)
 await repo.walletExecution.recordSubmission(...refs,claim.claimToken,hash)
 await repo.walletExecution.recordSubmission(...refs,claim.claimToken,hash)
 await assert.rejects(()=>repo.walletExecution.recordSubmission(...refs,claim.claimToken,'0x'+'cc'.repeat(32)),/different transaction/)
 assert.equal((await repo.get(...refs.slice(0,2))).balances[0].reserved,'1500000')
 assert.equal((await repo.get(...refs.slice(0,2))).balances[0].paid,'0')
}
const revoked=await reserved('USDC','revoked')
const claim=await repo.walletExecution.claim(...revoked,'worker_revoked')
preflight=async transfer=>{await repo.revokeWallet('project_a','wallet_revoked');return good(transfer)}
await assert.rejects(()=>repo.walletExecution.beginSubmission(...revoked,claim.claimToken),/no longer eligible/)
assert.equal((await repo.walletExecution.get(...revoked)).state,'claimed')
assert.equal((await repo.get(...revoked.slice(0,2))).operations[0].status,'reserved')
// The bank coordinator shares the submission hash namespace.
const bankBook={plan:{projectId:'project_bank',paymentId:'payment_bank'},operations:[{id:'operation_bank'}],bankReservations:[{quote:{operationId:'operation_bank'}}],bankExecutions:[{operationId:'operation_bank',attemptId:'attempt_bank',claimToken:'token_bank',state:'submitting'}]}
stored.books.push(bankBook)
await assert.rejects(()=>repo.bankExecution.recordSubmission('project_bank','payment_bank','operation_bank','token_bank','0x'+'aa'.repeat(32)),/another payout/)
console.log('PASS wallet execution: both assets, exclusive claims, stale-worker fencing, mandatory exact-transfer/custody/fee preflight, stale/expired approval, concurrent submission, crash recovery without retry, revocation and cross-route transaction uniqueness. Synthetic signatures only; no transaction signing or network calls.')

const cancelActor={credentialId:'credential_a',businessReference:'cancel_revoked'}
await repo.cancelPayout(...revoked.slice(0,2),'cancel_wallet',revoked[2],cancelActor)
assert.equal((await repo.get(...revoked.slice(0,2))).balances[0].available,'1500000')
assert.equal((await repo.walletExecution.get(...revoked)).state,'expired')
await assert.rejects(()=>repo.walletExecution.beginSubmission(...revoked,claim.claimToken),/expired/)
await assert.rejects(()=>repo.walletExecution.claim(...revoked,'worker_late'),/unavailable/)
console.log('PASS revoked wallet reservation cancellation restores funds and blocks stale or new submission claims.')
