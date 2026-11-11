import assert from 'node:assert/strict'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
import {createMarketplaceBankVerifier} from '../api/marketplace/bank-beneficiaries.ts'
import {BASE_STABLECOINS} from '../src/lib/baseStablecoins.ts'
import {marketplaceBankReceipt} from '../api/marketplace/bank-receipt.ts'
import {paymentReceiptView} from '../src/lib/paymentReceiptPdf.ts'
import {validateMarketplaceBankQuote} from '../api/marketplace/bank-quotes.ts'
let evidence=null,failCommit=false
let stored,queue=Promise.resolve(),now=1000000,quotes=new Map(),preflight=async quote=>({quote,holdingApproved:true,authorizationActive:true})
const verifier=createMarketplaceBankVerifier({key:Buffer.alloc(32,11),keyId:'test_key',verifyAccount:async()=> 'Test Seller',verifyOwnership:async request=>({...request,verified:true,evidenceId:'test_ownership'})})
const deps={verifyBankOutcome:async()=>structuredClone(evidence),now:()=>now,verifyBank:verifier.verify,resolveBankQuote:async({quoteId})=>structuredClone(quotes.get(quoteId)||null),preflightBankExecution:quote=>preflight(quote),read:async()=>structuredClone(stored),mutate:fn=>{const job=queue.then(()=>{const next=fn(structuredClone(stored||{books:[],drafts:[]}));if(failCommit)throw Error('fixture commit failure');stored=next;return structuredClone(next)});queue=job.catch(()=>{});return job}}
let repo=createMarketplaceRepository(deps)
await repo.registerBank({projectId:'project_a',sellerId:'seller_a',beneficiaryId:'bank_a',bankCode:'TESTBANK',accountNumber:'0123456789'})
async function reserve(id){
 await repo.createWithVerifiedBeneficiaries({projectId:'project_a',paymentId:id,network:'base',asset:'USDC',amount:'10',allocations:[{id:'share_a',sellerId:'seller_a',beneficiaryId:'bank_a',role:'seller',amount:'10',settlement:'cash_balance'}]},'draft_'+id)
 await repo.execute('project_a',id,'fund_'+id,{type:'fund',network:'base',asset:'USDC',amountUnits:'10000000',evidenceId:'fixture:'+id})
 await repo.execute('project_a',id,'release_'+id,{type:'release',allocationId:'share_a',amountUnits:'10000000'})
 const quote={quoteId:'quote_'+id,projectId:'project_a',paymentId:id,allocationId:'share_a',operationId:'op_'+id,beneficiaryId:'bank_a',destinationDigest:stored.bankBeneficiaries[0].destinationDigest,provider:'paycrest',providerOrderId:'provider_'+id,intentId:'intent_'+id,network:'base',asset:'USDC',tokenAddress:BASE_STABLECOINS.USDC.address,currency:'NGN',debitUnits:'10000000',fundingUnits:'9990000',netUnits:'9890000',networkFeeUnits:'10000',feePolicy:'fixed_success_only',exchangeRate:'1500',commissionUnits:'29670',commissionRateBps:30,feeUnits:'100000',maximumFeeUnits:'200000',feePayer:'allocation',ngnMinor:'1483500',requestedNgnMinor:'1483500',holdingId:'holding_a',holdingRevision:'revision_one',refundAddress:'0x'+'11'.repeat(20),fundingAddress:'0x'+'22'.repeat(20),issuedAt:now,expiresAt:now+300000,status:'initiated',submitted:false}
 for(const patch of [{networkFeeUnits:'10001'},{feePolicy:'unlimited'},{networkFeeUnits:undefined},{exchangeRate:undefined},{exchangeRate:'1501'},{maximumFeeUnits:'100000'}])assert.throws(()=>validateMarketplaceBankQuote({...quote,...patch},now))
 quotes.set(quote.quoteId,quote)
 await repo.reserveBankPayout('project_a',id,quote.quoteId,'reserve_'+id,{credentialId:'credential_a',businessReference:'seller_payout_'+id})
 return ['project_a',id,quote.operationId]
}
async function submitted(id){
 const refs=await reserve(id),attempt=await repo.bankExecution.claim(...refs,'test_worker')
 await repo.bankExecution.beginSubmission(...refs,attempt.claimToken)
 const quote=quotes.get('quote_'+id)
 return {refs,attempt,quote}
}
function proof(patch,target){
 const {quote:q,attempt:a}=target
 return {evidenceId:'outcome:'+q.paymentId,projectId:q.projectId,paymentId:q.paymentId,operationId:q.operationId,attemptId:a.attemptId,providerOrderId:q.providerOrderId,holdingId:q.holdingId,holdingRevision:q.holdingRevision,destinationDigest:q.destinationDigest,network:'base',asset:'USDC',currency:'NGN',basis:'bank_settled',providerFinal:true,fundingTransactionHash:'0x'+(q.paymentId==='payment_one'?'ab':q.paymentId==='payment_two'?'cd':'ef').repeat(32),fundingEvidenceId:'chain:'+q.paymentId,providerEvidenceId:'provider:'+q.paymentId,fundingUnits:q.fundingUnits,ngnPaidMinor:q.ngnMinor,returnedUnits:'0',finalizedAt:now,...patch}
}
const one=await submitted('payment_one'),reconcile=()=>repo.bankReconciliation.reconcile(...one.refs)
await assert.rejects(()=>createMarketplaceRepository({...deps,verifyBankOutcome:undefined}).bankReconciliation.reconcile(...one.refs),/not configured/)
assert.equal((await reconcile()).changed,false)
await assert.rejects(()=>repo.execute(...one.refs.slice(0,2),'forged_status',{type:'result',operationId:one.refs[2],status:'settled',evidenceId:'forged:proof'}),/verified outcome/)
for(const patch of [{projectId:'other_project'},{attemptId:'other_attempt'},{holdingRevision:'other_revision'},{providerOrderId:'other_order'},{destinationDigest:'wrong'},{asset:'USDT'},{fundingUnits:'9999999'},{ngnPaidMinor:'1499999'},{providerFinal:false},{finalizedAt:now+1},{basis:'timeout'},{basis:'fully_returned',ngnPaidMinor:'0',returnedUnits:'9999999',returnEvidenceId:'return:partial'}]){
 evidence=proof(patch,one);await assert.rejects(reconcile)
 assert.equal((await repo.get(...one.refs.slice(0,2))).balances[0].reserved,'10000000')
}
evidence=proof({raw:{account:'0123456789'}},one)
failCommit=true
await assert.rejects(reconcile,/commit failure/)
assert.equal((await repo.get(...one.refs.slice(0,2))).bankEvents,undefined)
assert.equal((await repo.get(...one.refs.slice(0,2))).balances[0].reserved,'10000000')
failCommit=false
const concurrent=await Promise.all([reconcile(),reconcile()])
assert.equal(concurrent.filter(r=>r.changed).length,1)
let book=await repo.get(...one.refs.slice(0,2))
assert.equal(book.balances[0].paid,'9990000');assert.equal(book.balances[0].feesAccrued,'10000');assert.equal(book.bankEvents[0].fees.chargedNetworkFeeUnits,'10000');assert.equal(book.balances[0].reserved,'0')
const receipt=marketplaceBankReceipt(book,one.refs[2]),view=paymentReceiptView(receipt);assert.equal(view.amount,'14835.00 NGN');assert.equal(view.rows.find(r=>r.label==='Network fee').value,'0.01 USDC');assert.equal(view.rows.find(r=>r.label==='Provider fee').value,'0.07033 USDC');assert.equal(view.rows.find(r=>r.label==='Amount debited').value,'10.00 USDC');assert.equal(JSON.stringify(receipt).includes('0123456789'),false)
assert.equal(book.bankEvents.length,1);assert.equal(book.bankEvents[0].delivery,'pending')
assert.equal(book.bankReconciliations[0].evidence.raw,undefined)
repo=createMarketplaceRepository(deps)
assert.equal((await reconcile()).changed,false)
assert.equal((await repo.get(...one.refs.slice(0,2))).bankEvents.length,1)
await assert.rejects(()=>repo.bankExecution.markUncertain(...one.refs,one.attempt.claimToken),/does not match/)
evidence=proof({basis:'funding_reverted',ngnPaidMinor:'0'},one)
await assert.rejects(reconcile,/evidence was changed/)
evidence=proof({evidenceId:'outcome:late_failure',basis:'funding_reverted',ngnPaidMinor:'0'},one)
await assert.rejects(reconcile,/already final/)
const two=await submitted('payment_two')
evidence=proof({fundingEvidenceId:'chain:payment_one'},two)
await assert.rejects(()=>repo.bankReconciliation.reconcile(...two.refs),/already used/)
evidence=proof({fundingTransactionHash:'0x'+'ab'.repeat(32)},two)
await assert.rejects(()=>repo.bankReconciliation.reconcile(...two.refs),/another payout/)
evidence=proof({basis:'fully_returned',ngnPaidMinor:'0',returnedUnits:'9990000',returnEvidenceId:'chain:return_two'},two)
assert.equal((await repo.bankReconciliation.reconcile(...two.refs)).status,'failed')
book=await repo.get(...two.refs.slice(0,2))
assert.equal(book.balances[0].available,'10000000');assert.equal(book.balances[0].reserved,'0');assert.equal(book.balances[0].paid,'0')
assert.equal(book.bankEvents[0].type,'marketplace.payout.failed');assert.equal(book.bankEvents[0].fees.chargedNetworkFeeUnits,'0');assert.equal(book.bankEvents[0].debitUnits,'0');assert.equal(book.balances[0].feesAccrued,undefined)
const three=await submitted('payment_three')
evidence=proof({basis:'funding_reverted',ngnPaidMinor:'0'},three)
await repo.bankReconciliation.reconcile(...three.refs)
assert.equal((await repo.get(...three.refs.slice(0,2))).balances[0].available,'10000000')
assert.equal(JSON.stringify(stored).includes('0123456789'),false)
console.log('PASS bank network fee reconciliation: fail-closed verifier, exact binding and amounts, rejection of partial returns, commit rollback, concurrent idempotency, proof/hash replay protection, immutable final outcomes, full-return/reverted-funding restoration and atomic pending events. Synthetic evidence only; no provider or chain verification performed.')

assert.equal(view.rows.find(r=>r.label==='Withdrawal commission').value,'0.02967 USDC');assert.equal(receipt.marketplaceBankFees.chargedCommissionUnits,'29670');assert.equal(book.bankEvents[0].fees.chargedCommissionUnits,'0')
