import assert from 'node:assert/strict'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
import {createMarketplaceBankVerifier} from '../api/marketplace/bank-beneficiaries.ts'
import {BASE_STABLECOINS} from '../src/lib/baseStablecoins.ts'
let stored,queue=Promise.resolve(),now=1000000,quotes=new Map(),preflight=async quote=>({quote,holdingApproved:true,authorizationActive:true})
const verifier=createMarketplaceBankVerifier({key:Buffer.alloc(32,11),keyId:'test_key',verifyAccount:async()=> 'Test Seller',verifyOwnership:async request=>({...request,verified:true,evidenceId:'test_ownership'})})
const deps={now:()=>now,verifyBank:verifier.verify,resolveBankQuote:async({quoteId})=>structuredClone(quotes.get(quoteId)||null),preflightBankExecution:quote=>preflight(quote),read:async()=>structuredClone(stored),mutate:fn=>{const job=queue.then(()=>{const next=fn(structuredClone(stored||{books:[],drafts:[]}));stored=next;return structuredClone(next)});queue=job.catch(()=>{});return job}}
let repo=createMarketplaceRepository(deps)
await repo.registerBank({projectId:'project_a',sellerId:'seller_a',beneficiaryId:'bank_a',bankCode:'TESTBANK',accountNumber:'0123456789'})
async function reserve(id){
 await repo.createWithVerifiedBeneficiaries({projectId:'project_a',paymentId:id,network:'base',asset:'USDC',amount:'10',allocations:[{id:'share_a',sellerId:'seller_a',beneficiaryId:'bank_a',role:'seller',amount:'10',settlement:'cash_balance'}]},'draft_'+id)
 await repo.execute('project_a',id,'fund_'+id,{type:'fund',network:'base',asset:'USDC',amountUnits:'10000000',evidenceId:'fixture:'+id})
 await repo.execute('project_a',id,'release_'+id,{type:'release',allocationId:'share_a',amountUnits:'10000000'})
 const quote={quoteId:'quote_'+id,projectId:'project_a',paymentId:id,allocationId:'share_a',operationId:'op_'+id,beneficiaryId:'bank_a',destinationDigest:stored.bankBeneficiaries[0].destinationDigest,provider:'paycrest',providerOrderId:'provider_'+id,intentId:'intent_'+id,network:'base',asset:'USDC',tokenAddress:BASE_STABLECOINS.USDC.address,currency:'NGN',debitUnits:'10000000',fundingUnits:'10000000',netUnits:'9900000',feeUnits:'100000',maximumFeeUnits:'200000',feePayer:'allocation',ngnMinor:'1500000',requestedNgnMinor:'1500000',holdingId:'holding_a',holdingRevision:'revision_one',refundAddress:'0x'+'11'.repeat(20),fundingAddress:'0x'+'22'.repeat(20),issuedAt:now,expiresAt:now+300000,status:'initiated',submitted:false}
 quotes.set(quote.quoteId,quote)
 await repo.reserveBankPayout('project_a',id,quote.quoteId,'reserve_'+id,{credentialId:'credential_a',businessReference:'seller_payout_'+id})
 return ['project_a',id,quote.operationId]
}
const refs=await reserve('payment_one')
await assert.rejects(()=>repo.bankExecution.claim('other_project',refs[1],refs[2],'worker_a'),/not found/)
const race=await Promise.allSettled(['worker_a','worker_b'].map(w=>repo.bankExecution.claim(...refs,w)))
assert.equal(race.filter(r=>r.status==='fulfilled').length,1)
const first=race.find(r=>r.status==='fulfilled').value
await assert.rejects(()=>createMarketplaceRepository({...deps,preflightBankExecution:undefined}).bankExecution.beginSubmission(...refs,first.claimToken),/not configured/)
await assert.rejects(()=>repo.bankExecution.recordSubmission(...refs,first.claimToken,'0x'+'aa'.repeat(32)),/does not match/)
now+=31000
const second=await repo.bankExecution.claim(...refs,'worker_c')
assert.notEqual(second.claimToken,first.claimToken)
await assert.rejects(()=>repo.bankExecution.beginSubmission(...refs,first.claimToken),/expired/)
for(const patch of [{holdingApproved:false},{authorizationActive:false}]){
 preflight=async quote=>({quote,holdingApproved:true,authorizationActive:true,...patch})
 await assert.rejects(()=>repo.bankExecution.beginSubmission(...refs,second.claimToken),/no longer matches/)
}
preflight=async quote=>({quote:{...quote,holdingRevision:'changed_revision'},holdingApproved:true,authorizationActive:true})
await assert.rejects(()=>repo.bankExecution.beginSubmission(...refs,second.claimToken),/no longer matches/)
preflight=async quote=>{now+=5001;return {quote,holdingApproved:true,authorizationActive:true}}
await assert.rejects(()=>repo.bankExecution.beginSubmission(...refs,second.claimToken),/stale/)
assert.equal((await repo.get(...refs.slice(0,2))).operations[0].status,'reserved')
preflight=async quote=>({quote,holdingApproved:true,authorizationActive:true})
const submit=await Promise.allSettled([1,2].map(()=>repo.bankExecution.beginSubmission(...refs,second.claimToken)))
assert.equal(submit.filter(r=>r.status==='fulfilled').length,1)
assert.equal((await repo.bankExecution.get(...refs)).state,'submitting')
assert.equal((await repo.get(...refs.slice(0,2))).operations[0].status,'unknown','ambiguity is committed before external execution')
// Simulate a crash after the marker but before receiving any transaction hash.
repo=createMarketplaceRepository(deps);now+=31000
await assert.rejects(()=>repo.bankExecution.claim(...refs,'worker_restart'),/reconciliation/)
await assert.rejects(()=>repo.bankExecution.beginSubmission(...refs,second.claimToken),/already used/)
await repo.bankExecution.markUncertain(...refs,second.claimToken)
const hash='0x'+'ab'.repeat(32)
await repo.bankExecution.recordSubmission(...refs,second.claimToken,hash)
await repo.bankExecution.recordSubmission(...refs,second.claimToken,hash)
await assert.rejects(()=>repo.bankExecution.recordSubmission(...refs,second.claimToken,'0x'+'cd'.repeat(32)),/different transaction/)
assert.equal((await repo.get(...refs.slice(0,2))).operations[0].status,'unknown','a hash is not settlement proof')
assert.equal((await repo.get(...refs.slice(0,2))).balances[0].reserved,'10000000')
assert.equal((await repo.get(...refs.slice(0,2))).bankExecutions[0].state,'expired')
const refsTwo=await reserve('payment_two')
const other=await repo.bankExecution.claim(...refsTwo,'worker_d')
await repo.bankExecution.beginSubmission(...refsTwo,other.claimToken)
await assert.rejects(()=>repo.bankExecution.recordSubmission(...refsTwo,other.claimToken,hash),/another payout/)
const refsThree=await reserve('payment_three')
const revoked=await repo.bankExecution.claim(...refsThree,'worker_e')
preflight=async quote=>{await repo.revokeBank('project_a','bank_a');return {quote,holdingApproved:true,authorizationActive:true}}
await assert.rejects(()=>repo.bankExecution.beginSubmission(...refsThree,revoked.claimToken),/no longer eligible/)
assert.equal((await repo.bankExecution.get(...refsThree)).state,'claimed')
assert.equal((await repo.get(...refsThree.slice(0,2))).operations[0].status,'reserved')
console.log('PASS bank execution coordinator: atomic claim race, lease replacement and stale-worker fencing, mandatory fresh preflight, changed custody/authority rejection, durable pre-submission ambiguity, crash recovery without resubmission, hash binding, revocation and reserved-funds preservation. No signing or provider calls.')
