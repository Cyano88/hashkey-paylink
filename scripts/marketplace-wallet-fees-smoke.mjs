import assert from 'node:assert/strict'
import {privateKeyToAccount} from 'viem/accounts'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
import {walletTransferHash} from '../api/marketplace/wallet-execution.ts'
import {validateMarketplaceWalletQuote} from '../api/marketplace/wallet-quotes.ts'
import {createMarketplaceBackingCheck} from '../api/marketplace/backing.ts'
import {paymentReceiptView} from '../src/lib/paymentReceiptPdf.ts'
import {marketplaceWalletReceipt} from '../api/marketplace/wallet-receipt.ts'
import {marketplaceFeeAmount} from '../src/lib/marketplaceFeeDisplay.ts'
const wallet=privateKeyToAccount('0x'+'44'.repeat(32)),sender='0x'+'22'.repeat(20),blockHash='0x'+'dd'.repeat(32)
let now=1000000,stored,queue=Promise.resolve(),quote,outcome,delivered
const actor={credentialId:'credential_a',businessReference:'delivery_a'}
const deps={now:()=>now,read:async()=>structuredClone(stored),mutate:fn=>{const job=queue.then(()=>{const next=fn(structuredClone(stored??{books:[],drafts:[]}));stored=next;return structuredClone(next)});queue=job.catch(()=>{});return job},resolveWalletQuote:async()=>structuredClone(quote),verifyWalletOutcome:async()=>structuredClone(outcome),
 preflightWalletExecution:async transfer=>({holdingId:'holding_a',holdingRevision:'revision_a',sender,feePolicyId:'policy_a',transferHash:walletTransferHash(transfer),expiresAt:now+60000,holdingApproved:true,authorizationActive:true,feesCoveredOutsideAllocation:true,additionalTokenDebitUnits:'0'}),
 notifyMarketplace:async(_p,_t,data,event)=>{delivered=data;return {status:'sent',eventId:event.eventId,responseStatus:200}}}
let repo=createMarketplaceRepository(deps)
async function setup(id){
 const paymentId='payment_'+id,beneficiaryId='wallet_'+id
 const challenge=await repo.beginWalletVerification({projectId:'project_a',sellerId:'seller_a',beneficiaryId,asset:'USDC',address:wallet.address})
 await repo.verifyWallet('project_a',beneficiaryId,challenge.nonce,await wallet.signMessage({message:challenge.message}))
 await repo.createWithVerifiedWallets({projectId:'project_a',paymentId,network:'base',asset:'USDC',amount:'90',allocations:[{id:'share_a',sellerId:'seller_a',beneficiaryId,role:'seller',amount:'90',settlement:'wallet_usdc'}]},'draft_'+id)
 await repo.execute('project_a',paymentId,'fund_'+id,{type:'fund',evidenceId:'proof_'+id,network:'base',asset:'USDC',amountUnits:'90000000'})
 await repo.execute('project_a',paymentId,'release_'+id,{type:'release',allocationId:'share_a',amountUnits:'90000000'})
 quote={quoteId:'quote_'+id,projectId:'project_a',paymentId,operationId:'operation_'+id,allocationId:'share_a',beneficiaryId,recipient:wallet.address,asset:'USDC',network:'base',feePayer:'allocation',feePolicy:'fixed_success_only',debitUnits:'90000000',recipientUnits:'89990000',networkFeeUnits:'10000',issuedAt:now,expiresAt:now+60000}
 return ['project_a',paymentId,quote.operationId]
}
const refs=await setup('success')
for(const patch of [{networkFeeUnits:'10001'},{recipientUnits:'0'},{feePayer:'buyer'},{asset:'USDT'},{expiresAt:now+5000},{debitUnits:'9e7'}])assert.throws(()=>validateMarketplaceWalletQuote({...quote,...patch},now))
assert.equal((await repo.walletPayouts.preview(...refs.slice(0,2),quote.quoteId)).recipientUnits,'89990000')
await assert.rejects(()=>createMarketplaceRepository({...deps,resolveWalletQuote:undefined}).walletPayouts.reserveQuoted(...refs.slice(0,2),'missing_a',quote.quoteId,actor),/not configured/)
const accepted=structuredClone(quote)
quote={...accepted,projectId:'project_other'}
await assert.rejects(()=>repo.walletPayouts.reserveQuoted(...refs.slice(0,2),'wrong_a',accepted.quoteId,actor),/binding/)
quote=accepted
const results=await Promise.allSettled(['reserve_a','reserve_b'].map(key=>repo.walletPayouts.reserveQuoted(...refs.slice(0,2),key,quote.quoteId,actor)))
assert.equal(results.filter(x=>x.status==='fulfilled').length,1)
const reservation=results.find(x=>x.status==='fulfilled').value.reservation
assert.equal((await repo.get(...refs.slice(0,2))).balances[0].reserved,'90000000')
assert.equal((await repo.walletPayouts.prepareTransfer(...refs)).amountUnits,'89990000')
const claim=await repo.walletExecution.claim(...refs,'worker_a')
const begun=await repo.walletExecution.beginSubmission(...refs,claim.claimToken)
assert.equal(begun.transfer.quote.networkFeeUnits,'10000')
await assert.rejects(()=>repo.cancelPayout(...refs.slice(0,2),'cancel_a',refs[2],actor),/not found|submitted/)
now+=90000 // expiry must not stop reconciliation or idempotent retrieval
repo=createMarketplaceRepository({...deps,resolveWalletQuote:undefined})
assert.equal((await repo.walletPayouts.reserveQuoted(...refs.slice(0,2),reservation.key,accepted.quoteId,actor)).operation.status,'unknown')
function evidence(refs,attempt,reservation,reverted=false){return {projectId:refs[0],paymentId:refs[1],operationId:refs[2],attemptId:attempt.attemptId,holdingId:'holding_a',holdingRevision:'revision_a',transferHash:attempt.executionAuthorization.transferHash,chainId:8453,asset:'USDC',tokenAddress:reservation.tokenAddress,sender,recipient:wallet.address,requestedUnits:reservation.amountUnits,transferredUnits:reverted?'0':reservation.amountUnits,transactionHash:'0x'+(reverted?'bb':'aa').repeat(32),blockHash,blockNumber:'100',logIndex:reverted?null:1,outcome:reverted?'reverted':'transferred',finality:'finalized',finalizedAt:now}}
outcome=evidence(refs,begun.attempt,reservation)
await Promise.all([repo.walletReconciliation.reconcile(...refs),repo.walletReconciliation.reconcile(...refs)])
let book=await repo.get(...refs.slice(0,2))
assert.equal(book.balances[0].paid,'89990000');assert.equal(book.balances[0].feesAccrued,'10000');assert.equal(book.balances[0].reserved,'0')
assert.equal(book.walletEvents.length,1)
const receipt=marketplaceWalletReceipt(book,refs[2]);assert.equal(receipt.marketplaceWalletFees.debitUnits,'90000000');assert.equal(receipt.marketplaceWalletFees.networkFeeUnits,'10000');assert.equal(receipt.amount,'89.99')
const view=paymentReceiptView(receipt);assert.equal(view.amount,'89.99 USDC');assert.equal(view.rows.find(r=>r.label==='Network fee').value,'0.01 USDC');assert.equal(view.rows.find(r=>r.label==='Amount debited').value,'90.00 USDC')
assert.equal(marketplaceFeeAmount('1500000'),'1.50');assert.equal(marketplaceFeeAmount('1'),'0.000001');assert.equal(marketplaceFeeAmount('10000'),'0.01')
await repo.webhooks.deliver(refs[0],refs[1],book.walletEvents[0].id)
assert.equal(delivered.debitUnits,'90000000');assert.equal(delivered.recipientAmountUnits,'89990000');assert.equal(delivered.fees.chargedNetworkFeeUnits,'10000')
// Retained fees remain protected by the holding backing check.
book.refundCollection={holdingId:'holding_a',holdingRevision:'revision_a',holdingAddress:sender,fundingEvidenceId:book.fundingEvidence,asset:'USDC',amountUnits:book.plan.amountUnits,tokenAddress:reservation.tokenAddress}
book.collectionProof={evidenceId:book.fundingEvidence,blockNumber:'90'}
const check=createMarketplaceBackingCheck({read:async()=>({books:[book],drafts:[]}),holding:{id:'holding_a',revision:'revision_a',address:sender,billsAddress:'0x'+'33'.repeat(20)},chain:{getChainId:async()=>8453,getBlock:async()=>({number:100n,hash:blockHash}),readContract:async()=>9999n}})
assert.equal((await check()).shortfallUnits,'1')
repo=createMarketplaceRepository(deps)
const failed=await setup('failed')
const r=await repo.walletPayouts.reserveQuoted(...failed.slice(0,2),'reserve_failed',quote.quoteId,actor)
const c=await repo.walletExecution.claim(...failed,'worker_a'),b=await repo.walletExecution.beginSubmission(...failed,c.claimToken)
outcome=evidence(failed,b.attempt,r.reservation,true)
await repo.walletReconciliation.reconcile(...failed)
book=await repo.get(...failed.slice(0,2));assert.equal(book.balances[0].available,'90000000');assert.equal(book.balances[0].feesAccrued,undefined);assert.equal(book.walletEvents[0].fees.chargedNetworkFeeUnits,'0');assert.equal(book.walletEvents[0].debitUnits,'0')
const cancelled=await setup('cancelled')
await repo.walletPayouts.reserveQuoted(...cancelled.slice(0,2),'reserve_cancelled',quote.quoteId,actor)
now+=60000
await assert.rejects(()=>repo.walletExecution.claim(...cancelled,'worker_a'),/expired/)
await repo.cancelPayout(...cancelled.slice(0,2),'cancel_expired',cancelled[2],actor)
assert.equal((await repo.get(...cancelled.slice(0,2))).balances[0].available,'90000000')
console.log('PASS quoted wallet fees: exact net/gross, trusted quote binding, races, expiry, cancellation, unknown/restart, successful fee accrual, failed full restoration, single webhook and retained-fee backing. Fixtures only; no funds moved.')
