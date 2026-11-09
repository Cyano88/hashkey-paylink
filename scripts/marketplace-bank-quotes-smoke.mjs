import assert from 'node:assert/strict'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
import {createMarketplaceBankVerifier} from '../api/marketplace/bank-beneficiaries.ts'
import {validateMarketplaceBankQuote} from '../api/marketplace/bank-quotes.ts'
import {BASE_STABLECOINS} from '../src/lib/baseStablecoins.ts'
let stored,queue=Promise.resolve(),now=1000000,lookups=0,quotes=new Map(),onResolve=()=>{},beforeMutation=()=>{}
const verifier=createMarketplaceBankVerifier({key:Buffer.alloc(32,11),keyId:'test_key',verifyAccount:async()=> 'Test Seller',verifyOwnership:async request=>({...request,verified:true,evidenceId:'test_ownership'})})
const deps={now:()=>now,verifyBank:verifier.verify,resolveBankQuote:async({quoteId})=>{lookups++;onResolve();return structuredClone(quotes.get(quoteId)||null)},read:async()=>structuredClone(stored),mutate:fn=>{const job=queue.then(()=>{beforeMutation();const next=fn(structuredClone(stored||{books:[],drafts:[]}));stored=next;return structuredClone(next)});queue=job.catch(()=>{});return job}}
let repo=createMarketplaceRepository(deps)
await repo.registerBank({projectId:'project_a',sellerId:'seller_a',beneficiaryId:'bank_a',bankCode:'TESTBANK',accountNumber:'0123456789'})
async function payment(paymentId){
 await repo.createWithVerifiedBeneficiaries({projectId:'project_a',paymentId,network:'base',asset:'USDC',amount:'10',allocations:[{id:'share_a',sellerId:'seller_a',beneficiaryId:'bank_a',role:'seller',amount:'10',settlement:'cash_balance'}]},'draft_'+paymentId)
 await repo.execute('project_a',paymentId,'fund_'+paymentId,{type:'fund',network:'base',asset:'USDC',amountUnits:'10000000',evidenceId:'fixture:'+paymentId})
 await repo.execute('project_a',paymentId,'release_'+paymentId,{type:'release',allocationId:'share_a',amountUnits:'10000000'})
}
await payment('payment_one')
const base={quoteId:'quote_one',projectId:'project_a',paymentId:'payment_one',allocationId:'share_a',operationId:'operation_one',beneficiaryId:'bank_a',destinationDigest:stored.bankBeneficiaries[0].destinationDigest,provider:'paycrest',providerOrderId:'provider_one',intentId:'intent_one',network:'base',asset:'USDC',tokenAddress:BASE_STABLECOINS.USDC.address,currency:'NGN',debitUnits:'10000000',fundingUnits:'10000000',netUnits:'9900000',feeUnits:'100000',maximumFeeUnits:'200000',feePayer:'allocation',ngnMinor:'1500000',requestedNgnMinor:'1500000',holdingId:'holding_a',holdingRevision:'revision_one',refundAddress:'0x'+'11'.repeat(20),fundingAddress:'0x'+'22'.repeat(20),issuedAt:now,expiresAt:now+300000,status:'initiated',submitted:false}
const actor={credentialId:'credential_a',businessReference:'seller_payout_one'}
quotes.set(base.quoteId,base)
const reserve=(key='reserve_one',quoteId='quote_one',paymentId='payment_one')=>repo.reserveBankPayout('project_a',paymentId,quoteId,key,actor)
for(const patch of [{asset:'USDT'},{network:'arc'},{currency:'UGX'},{tokenAddress:BASE_STABLECOINS.USDT.address},{fundingUnits:'10000001'},{feeUnits:'300000',netUnits:'9700000'},{netUnits:'9800000'},{ngnMinor:'1500001'},{debitUnits:'1e7'},{expiresAt:now+90000},{issuedAt:NaN},{status:'settled'},{submitted:true},{fundingAddress:'0x'+'00'.repeat(20)}])assert.throws(()=>validateMarketplaceBankQuote({...base,...patch},now))
assert.equal(validateMarketplaceBankQuote({...base,raw:{accountNumber:'0123456789'}},now).raw,undefined)
await assert.rejects(()=>createMarketplaceRepository({...deps,resolveBankQuote:undefined}).reserveBankPayout('project_a','payment_one','quote_one','reserve_one',actor),/not configured/)
for(const patch of [{projectId:'project_other'},{paymentId:'payment_other'},{beneficiaryId:'bank_other'},{destinationDigest:'a'.repeat(64)},{allocationId:'share_other'}]){
 quotes.set('quote_one',{...base,...patch});await assert.rejects(()=>reserve());assert.equal((await repo.get('project_a','payment_one')).balances[0].reserved,'0')
}
quotes.set('quote_one',base)
await assert.rejects(()=>repo.execute('project_a','payment_one','generic_reserve',{type:'reserve',operationId:'generic_operation',allocationId:'share_a',kind:'payout',amountUnits:'1'}),/accepted quote/)
// Expiry must be checked again inside the transaction, after resolving a quote.
onResolve=()=>{now=base.expiresAt-90000}
await assert.rejects(()=>reserve(),/expiry/)
now=1000000;onResolve=()=>{}
beforeMutation=()=>{now=base.expiresAt-90000}
await assert.rejects(()=>reserve(),/expiry/)
assert.equal((await repo.get('project_a','payment_one')).balances[0].reserved,'0')
now=1000000;beforeMutation=()=>{}
const race=await Promise.allSettled([reserve(),reserve('reserve_competing')])
assert.equal(race.filter(r=>r.status==='fulfilled').length,1)
const book=await repo.get('project_a','payment_one')
assert.equal(book.bankReservations.length,1);assert.equal(book.balances[0].reserved,'10000000');assert.equal(book.balances[0].available,'0')
const accepted=book.bankReservations[0],key=accepted.key
now=base.expiresAt+1;repo=createMarketplaceRepository(deps)
const previousLookups=lookups
assert.equal((await reserve(key)).operation.status,'reserved')
assert.equal(lookups,previousLookups,'expired retries retrieve persisted reservation without resolving another quote')
await assert.rejects(()=>reserve(key,'different_quote'),/Idempotency/)
await repo.execute('project_a','payment_one','unknown_result',{type:'result',operationId:'operation_one',status:'unknown',evidenceId:'fixture:timeout'})
assert.equal((await reserve(key)).operation.status,'unknown')
assert.equal((await repo.get('project_a','payment_one')).balances[0].reserved,'10000000')
await payment('payment_two')
const quoteTwo={...base,quoteId:'quote_two',paymentId:'payment_two',operationId:'operation_two',issuedAt:now,expiresAt:now+300000}
quotes.set('quote_two',quoteTwo)
await assert.rejects(()=>reserve('reserve_two','quote_two','payment_two'),/already reserved/)
quotes.set('quote_two',{...quoteTwo,providerOrderId:'provider_two',intentId:'intent_two'})
await repo.revokeBank('project_a','bank_a')
await assert.rejects(()=>reserve('reserve_two','quote_two','payment_two'),/no longer eligible/)
assert.equal((await repo.get('project_a','payment_two')).balances[0].available,'10000000')
assert.equal(JSON.stringify(stored).includes('0123456789'),false)
console.log('PASS bank quote reservation: exact asset/debit/fee/NGN/destination checks, default-off resolver, quote/order uniqueness, atomic race, expiry, revocation, replay after restart/expiry, uncertain funds retained and sensitive payload stripping. Fixtures only; no Paycrest calls.')
const {createMarketplaceInstructions}=await import('../api/marketplace/instructions.ts')
let scopes=['marketplace:read']
const service=createMarketplaceInstructions({enabled:true,repository:repo,resolvePrincipal:async()=>({projectId:'project_a',credentialId:actor.credentialId,active:true,capabilities:['marketplace_payments'],scopes})})
const body={paymentId:'payment_one',quoteId:'quote_one',businessReference:actor.businessReference}
await assert.rejects(()=>service.reserveBankPayout('test_credential',key,body),/denied/)
scopes=['marketplace:payout']
for(const extra of [{projectId:'project_other'},{debitUnits:'1'},{status:'settled'},{destination:'override'}])await assert.rejects(()=>service.reserveBankPayout('test_credential',key,{...body,...extra}),/fields/)
const response=await service.reserveBankPayout('test_credential',key,body)
assert.equal(response.status,'unknown');assert.equal(response.feeUnits,'100000')
assert.equal(response.fundingAddress,undefined);assert.equal(response.providerOrderId,undefined);assert.equal(response.authorization,undefined)
scopes=[]
await assert.rejects(()=>service.reserveBankPayout('test_credential',key,body),/denied/)
console.log('PASS scoped payout instruction: explicit payout scope, strict request fields, current status on replay, sensitive data redaction and authorization rechecked on retries.')
