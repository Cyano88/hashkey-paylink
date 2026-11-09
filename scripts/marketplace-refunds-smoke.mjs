import assert from 'node:assert/strict'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
import {createMarketplaceInstructions} from '../api/marketplace/instructions.ts'
import {BASE_STABLECOINS} from '../src/lib/baseStablecoins.ts'
let stored,queue=Promise.resolve(),origin,lookups=0,scopes=['marketplace:refund']
const deps={read:async()=>structuredClone(stored),resolveRefundCollection:async()=>{lookups++;return structuredClone(origin)},mutate:fn=>{const job=queue.then(()=>{const next=fn(structuredClone(stored||{books:[],drafts:[]}));stored=next;return structuredClone(next)});queue=job.catch(()=>{});return job}}
let repo=createMarketplaceRepository(deps)
const actor={credentialId:'credential_a',businessReference:'delivery_failed'}
const allocations=[{id:'a_seller',sellerId:'seller_a',beneficiaryId:'bank_a',role:'seller',amount:'6',settlement:'cash_balance'},{id:'b_seller',sellerId:'seller_b',beneficiaryId:'wallet_b',role:'seller',amount:'3',settlement:'wallet_usdc'},{id:'z_fee',sellerId:'platform_a',beneficiaryId:'wallet_fee',role:'platform',amount:'1',settlement:'wallet_usdc'}]
const input={projectId:'project_a',paymentId:'payment_one',network:'base',asset:'USDC',amount:'10',allocations}
await repo.create(input,'draft_one')
const request={refundId:'refund_one',allocations:[{allocationId:'a_seller',amount:'3'},{allocationId:'b_seller',amount:'1'}]}
const reserve=(key='refund_key',body=request)=>repo.refunds.reserve('project_a','payment_one',key,body,actor)
await assert.rejects(()=>reserve(),/verified collection/)
await repo.execute('project_a','payment_one','fund_one',{type:'fund',evidenceId:'fixture:original_payment',network:'base',asset:'USDC',amountUnits:'10000000'})
origin={projectId:'project_a',paymentId:'payment_one',fundingEvidenceId:'fixture:original_payment',route:'wallet',network:'base',asset:'USDC',tokenAddress:BASE_STABLECOINS.USDC.address,amountUnits:'10000000',payerId:'buyer_a',payerWallet:'0x'+'11'.repeat(20),holdingId:'holding_one',holdingRevision:'revision_one',holdingAddress:'0x'+'22'.repeat(20)}
await assert.rejects(()=>createMarketplaceRepository({...deps,resolveRefundCollection:undefined}).refunds.reserve('project_a','payment_one','refund_key',request,actor),/not configured/)
const canonical=structuredClone(origin)
for(const patch of [{projectId:'other_project'},{paymentId:'other_payment'},{fundingEvidenceId:'other_evidence'},{route:'fiat'},{asset:'USDT'},{amountUnits:'9999999'},{tokenAddress:BASE_STABLECOINS.USDT.address},{payerWallet:origin.holdingAddress}]){origin={...canonical,...patch};await assert.rejects(()=>reserve())}
origin=canonical
const service=createMarketplaceInstructions({enabled:true,repository:repo,resolvePrincipal:async()=>({projectId:'project_a',credentialId:actor.credentialId,active:true,capabilities:['marketplace_payments'],scopes})})
const body={paymentId:'payment_one',...request,businessReference:actor.businessReference}
scopes=['marketplace:payout'];await assert.rejects(()=>service.reserveRefund('credential','refund_key',body),/denied/);scopes=['marketplace:refund']
for(const extra of [{projectId:'other_project'},{payerWallet:origin.payerWallet},{asset:'USDT'},{status:'refunded'}])await assert.rejects(()=>service.reserveRefund('credential','refund_key',{...body,...extra}),/fields/)
await assert.rejects(()=>reserve('refund_key',{...request,allocations:[request.allocations[0],request.allocations[0]]}),/Duplicate/)
await assert.rejects(()=>reserve('refund_key',{...request,allocations:[{allocationId:'a_seller',amount:'1.0000001'}]}),/decimal/)
await repo.execute('project_a','payment_one','release_one',{type:'release',allocationId:'a_seller',amountUnits:'4000000'})
const before=structuredClone(stored)
await assert.rejects(()=>reserve('refund_key',{...request,allocations:[{allocationId:'a_seller',amount:'1'},{allocationId:'z_fee',amount:'2'}]}),/Insufficient/)
assert.deepEqual(stored,before,'later failure rolls back earlier child reservation')
const response=await service.reserveRefund('credential','refund_key',body)
assert.equal(response.amountUnits,'4000000');assert.equal(response.payerWallet,undefined)
let book=await repo.get('project_a','payment_one')
assert.equal(book.balances[2].pending,'1000000','commission is never silently refunded')
const part=book.operations.find(o=>o.allocationId==='a_seller')
assert.equal(part.fromPending,'2000000');assert.equal(part.fromAvailable,'1000000')
const previousLookups=lookups
repo=createMarketplaceRepository(deps)
const retry=await reserve('refund_key',{...request,allocations:[{allocationId:'b_seller',amount:'1.000000'},{allocationId:'a_seller',amount:'3.0'}]})
assert.equal(lookups,previousLookups);assert.equal(retry.reservation.amountUnits,'4000000')
await assert.rejects(()=>reserve('refund_key',{...request,allocations:[{allocationId:'a_seller',amount:'2'}]}),/Idempotency/)
origin={...canonical,payerWallet:'0x'+'33'.repeat(20)}
await assert.rejects(()=>reserve('changed_origin',{refundId:'refund_changed',allocations:[{allocationId:'a_seller',amount:'1'}]}),/binding changed/)
origin=canonical
await reserve('fee_refund',{refundId:'refund_fee',allocations:[{allocationId:'z_fee',amount:'0.5'}]})
assert.equal((await repo.get('project_a','payment_one')).balances[2].pending,'500000')
const races=await Promise.allSettled(['one','two'].map(id=>reserve('race_'+id,{refundId:'race_refund_'+id,allocations:[{allocationId:'a_seller',amount:'3'}]})))
assert.equal(races.filter(r=>r.status==='fulfilled').length,1)
await assert.rejects(()=>repo.execute('project_a','payment_one','fake_final',{type:'result',operationId:part.id,status:'settled',evidenceId:'fixture:fake_refund'}),/dedicated verified/)
await repo.execute('project_a','payment_one','unknown_refund',{type:'result',operationId:part.id,status:'unknown',evidenceId:'fixture:timeout'})
assert.equal((await repo.refunds.get('project_a','payment_one','refund_one')).operations[0].status,'unknown')
await assert.rejects(()=>repo.refunds.get('project_other','payment_one','refund_one'),/not found/)
// Paid seller funds cannot be clawed back through a refund.
await repo.execute('project_a','payment_one','release_b',{type:'release',allocationId:'b_seller',amountUnits:'2000000'})
await repo.execute('project_a','payment_one','payout_b',{type:'reserve',operationId:'payout_b',allocationId:'b_seller',kind:'payout',amountUnits:'2000000'})
await repo.execute('project_a','payment_one','paid_b',{type:'result',operationId:'payout_b',status:'settled',evidenceId:'fixture:paid_b'})
await assert.rejects(()=>reserve('refund_paid',{refundId:'refund_paid',allocations:[{allocationId:'b_seller',amount:'0.000001'}]}),/Insufficient/)
// USDT returns remain USDT regardless of seller settlement conventions.
await repo.create({...input,paymentId:'payment_usdt',asset:'USDT',allocations:allocations.map(a=>({...a,settlement:'wallet_usdt'}))},'draft_usdt')
await repo.execute('project_a','payment_usdt','fund_usdt',{type:'fund',evidenceId:'fixture:usdt',network:'base',asset:'USDT',amountUnits:'10000000'})
origin={...canonical,paymentId:'payment_usdt',asset:'USDT',tokenAddress:BASE_STABLECOINS.USDT.address,fundingEvidenceId:'fixture:usdt'}
const usdt=await repo.refunds.reserve('project_a','payment_usdt','refund_usdt',{refundId:'refund_usdt',allocations:[{allocationId:'a_seller',amount:'1'}]},actor)
assert.equal(usdt.reservation.collection.asset,'USDT');assert.equal(usdt.reservation.collection.payerWallet,canonical.payerWallet)
console.log('PASS buyer refund reservations: original collection/payer binding, strict refund scope, explicit split/commission selection, pending+available provenance, all-or-nothing rollback, race/idempotency/restart, destination immutability, paid-fund exclusion and same-asset USDT. Synthetic collection records; no refunds sent.')
await assert.rejects(()=>repo.execute('project_a','payment_one','refund_bypass',{type:'reserve',operationId:'refund_bypass',allocationId:'z_fee',kind:'refund',amountUnits:'1'}),/original-payer binding/)
console.log('PASS generic refund reservation cannot bypass an established original-payer binding.')
