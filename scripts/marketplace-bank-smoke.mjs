import assert from 'node:assert/strict'
import {createMarketplaceBankVerifier} from '../api/marketplace/bank-beneficiaries.ts'
import {prepareMarketplaceBankPayout} from '../api/marketplace/bank-payout-preparation.ts'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
const request={projectId:'project_a',sellerId:'seller_a',beneficiaryId:'bank_v1',bankCode:'TESTBANK',accountNumber:'0123456789'}
let evidence={...request,verified:true,evidenceId:'ownership_fixture'},lookups=0
const options={key:Buffer.alloc(32,17),keyId:'fixture_key_v1',verifyAccount:async()=>{lookups++;return 'Fixture Seller'},verifyOwnership:async()=>evidence,now:()=>1000}
const verifier=createMarketplaceBankVerifier(options)
assert.throws(()=>createMarketplaceBankVerifier({...options,key:Buffer.alloc(4)}),/32-byte/)
await assert.rejects(()=>verifier.verify({...request,accountNumber:'123'}),/10-digit/)
assert.equal(lookups,0)
evidence=null
await assert.rejects(()=>verifier.verify(request),/ownership/)
evidence={...request,verified:true,evidenceId:'ownership_fixture',sellerId:'other_seller'}
await assert.rejects(()=>verifier.verify(request),/ownership/)
evidence={...request,verified:true,evidenceId:'ownership_fixture'}
await assert.rejects(()=>createMarketplaceBankVerifier({...options,verifyAccount:async()=> 'OK'}).verify(request),/name/)
const record=await verifier.verify(request)
assert.equal(JSON.stringify(record).includes(request.accountNumber),false)
assert.equal(JSON.stringify(record).includes('Fixture Seller'),false)
assert.equal(verifier.decrypt(record).accountNumber,request.accountNumber)
for(const patch of [{projectId:'other_project'},{sellerId:'other_seller'},{beneficiaryId:'other_bank'},{keyId:'other_key'},{destinationDigest:'wrong'}])assert.throws(()=>verifier.decrypt({...record,...patch}))
const damaged={...record,encryptedDetails:record.encryptedDetails.replace(/^./,record.encryptedDetails[0]==='a'?'b':'a')}
assert.throws(()=>verifier.decrypt(damaged))
let stored,queue=Promise.resolve()
const deps={verifyBank:verifier.verify,read:async()=>structuredClone(stored),mutate:fn=>{const job=queue.then(()=>{const next=fn(structuredClone(stored||{books:[],drafts:[]}));stored=next;return structuredClone(next)});queue=job.catch(()=>{});return job}}
const repo=createMarketplaceRepository(deps)
await assert.rejects(()=>createMarketplaceRepository({...deps,verifyBank:undefined}).registerBank(request),/not configured/)
const result=await repo.registerBank(request)
assert.equal(result.last4,'6789');assert.equal(result.encryptedDetails,undefined);assert.equal(result.ownershipEvidenceId,undefined)
assert.deepEqual(await repo.registerBank(request),result)
assert.equal(stored.bankBeneficiaries.length,1)
await assert.rejects(()=>repo.registerBank({...request,accountNumber:'1123456789'}),/ownership|already exists/)
await assert.rejects(()=>repo.beginWalletVerification({...request,address:'0x'+'11'.repeat(20),asset:'USDC'}),/already exists/)
const input={projectId:'project_a',paymentId:'payment_one',network:'base',asset:'USDC',amount:'10',allocations:[{id:'share_a',sellerId:'seller_a',beneficiaryId:'bank_v1',role:'seller',amount:'10',settlement:'cash_balance'}]}
await assert.rejects(()=>repo.createWithVerifiedBeneficiaries({...input,projectId:'other_project'},'draft_one'),/matching/)
await repo.createWithVerifiedBeneficiaries(input,'draft_one')
await repo.execute('project_a','payment_one','fund_one',{type:'fund',evidenceId:'base:fixture_bank',network:'base',asset:'USDC',amountUnits:'10000000'})
const prepare=async patch=>prepareMarketplaceBankPayout({book:await repo.get('project_a','payment_one'),allocationId:'share_a',operationId:'payout_one',currentBeneficiary:stored.bankBeneficiaries[0],debitUsdc:'10',ngnAmount:'15000.00',maximumFeeUsdc:'0.1',holdingRefundAddress:'0x'+'22'.repeat(20),...patch},verifier.decrypt)
await assert.rejects(()=>prepare({}),/released/)
await repo.execute('project_a','payment_one','release_one',{type:'release',allocationId:'share_a',amountUnits:'10000000'})
const before=structuredClone(stored),prepared=await prepare({})
assert.equal(prepared.debitUnits,'10000000');assert.equal(prepared.maximumFeeUnits,'100000');assert.equal(prepared.bank.accountNumber,request.accountNumber)
assert.deepEqual(stored,before,'preparation cannot reserve or move money')
for(const patch of [{ngnAmount:'1.001'},{ngnAmount:'0'},{ngnAmount:'0.00'},{debitUsdc:'10.000001'},{maximumFeeUsdc:'10'},{holdingRefundAddress:'0x'+'00'.repeat(20)}])await assert.rejects(()=>prepare(patch))
await repo.revokeBank('project_a','bank_v1')
await assert.rejects(()=>prepare({}),/not eligible/)
await assert.rejects(()=>repo.execute('project_a','payment_one','reserve_one',{type:'reserve',operationId:'payout_one',allocationId:'share_a',kind:'payout',amountUnits:'10000000'}),/no longer eligible/)
assert.equal((await repo.get('project_a','payment_one')).beneficiarySnapshots[0].status,'active')
assert.equal(JSON.stringify(stored).includes(request.accountNumber),false)
console.log('PASS bank beneficiaries/preparation: mandatory ownership evidence, encrypted destination binding, masked response, immutable version, scope/route checks, released-funds/precision/fee validation, no preparation mutation and revocation. Synthetic fixtures; no Paycrest calls.')
