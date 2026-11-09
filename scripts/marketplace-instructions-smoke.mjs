import assert from 'node:assert/strict'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
import {createMarketplaceInstructions} from '../api/marketplace/instructions.ts'

let stored, queue=Promise.resolve()
const repo=createMarketplaceRepository({read:async()=>structuredClone(stored),mutate:fn=>{
  const job=queue.then(()=>{const next=fn(structuredClone(stored||{books:[],drafts:[]}));stored=next;return structuredClone(next)})
  queue=job.catch(()=>{});return job
}})
const input={projectId:'project_a',paymentId:'payment_one',network:'base',asset:'USDC',amount:'10',allocations:[
  {id:'seller_share',sellerId:'seller_a',role:'seller',amount:'9',settlement:'cash_balance',beneficiaryId:'bank_a'},
  {id:'platform_fee',sellerId:'platform_a',role:'platform',amount:'1',settlement:'wallet_usdc',beneficiaryId:'wallet_a'},
]}
await repo.create(input,'draft_one')
await repo.execute('project_a','payment_one','fund_one',{type:'fund',evidenceId:'fixture:funding',network:'base',asset:'USDC',amountUnits:'10000000'})
const principal={projectId:'project_a',credentialId:'credential_a',active:true,capabilities:['marketplace_payments'],scopes:['marketplace:read','marketplace:release']}
let current=principal, lookups=0
const deps={repository:repo,resolvePrincipal:async credential=>{lookups++;return credential==='valid'?structuredClone(current):null}}
const disabled=createMarketplaceInstructions(deps), service=createMarketplaceInstructions({...deps,enabled:true})
await assert.rejects(()=>disabled.payment('valid','payment_one'),/not enabled/)
assert.equal(lookups,0)
await assert.rejects(()=>service.payment('invalid','payment_one'),/denied/)
for (const patch of [{active:false},{capabilities:['hosted_checkout']},{scopes:['checkout:read']}, {scopes:['marketplace:read']}]) {
  current={...principal,...patch}
  await assert.rejects(()=>service.release('valid','release_one',{paymentId:'payment_one',businessReference:'delivery_one',releases:[{allocationId:'seller_share',amount:'1'}]}),/denied/)
}
current={...principal,projectId:'project_other'}
assert.equal(await service.payment('valid','payment_one'),null)
assert.equal((await service.sellerBalances('valid','seller_a'))[0].units.pending,'0')
const body={paymentId:'payment_one',businessReference:'delivery_one',releases:[{allocationId:'seller_share',amount:'9'},{allocationId:'platform_fee',amount:'1'}]}
await assert.rejects(()=>service.release('valid','release_one',body),/not found/)
current=principal
for (const extra of [{projectId:'project_other'},{type:'fund'},{evidenceId:'forged'},{status:'settled'},{destination:'arbitrary'}]) {
  await assert.rejects(()=>service.release('valid','release_one',{...body,...extra}),/fields/)
}
await assert.rejects(()=>service.release('valid','release_one',{...body,releases:[body.releases[0],body.releases[0]]}),/Duplicate/)
await assert.rejects(()=>service.release('valid','release_one',{...body,releases:[{allocationId:'seller_share',amount:9}]}),/decimal/)
const before=structuredClone(stored)
await assert.rejects(()=>service.release('valid','release_one',{...body,releases:[{allocationId:'platform_fee',amount:'1'},{allocationId:'seller_share',amount:'10'}]}),/exceeds/)
assert.deepEqual(stored,before,'failure of later allocation rolls back the entire release')
await service.release('valid','release_one',body)
const committed=structuredClone(stored)
await service.release('valid','release_one',{...body,releases:[...body.releases].reverse()})
assert.deepEqual(stored,committed,'reordering allocations is the same retry')
await assert.rejects(()=>service.release('valid','release_one',{...body,businessReference:'different_delivery'}),/Idempotency/)
const book=await repo.get('project_a','payment_one')
assert.deepEqual(book.journal.at(-1).command.authorization,{credentialId:'credential_a',businessReference:'delivery_one'})
const response=await service.payment('valid','payment_one')
assert.equal(response.balances[0].available,'9000000')
assert.equal(response.balances[1].available,'1000000')
assert.equal(response.journal,undefined);assert.equal(response.fundingEvidence,undefined)
assert.equal(service.execute,undefined)
// Revocation is checked on each retry, not cached by idempotency key.
current={...principal,active:false}
await assert.rejects(()=>service.release('valid','release_one',body),/denied/)
current=principal
// Concurrent conflicting releases cannot partially consume the order.
await repo.create({...input,paymentId:'payment_race'},'draft_race')
await repo.execute('project_a','payment_race','fund_race',{type:'fund',evidenceId:'fixture:race',network:'base',asset:'USDC',amountUnits:'10000000'})
const race=await Promise.allSettled(['race_one','race_two'].map(key=>service.release('valid',key,{...body,paymentId:'payment_race'})))
assert.equal(race.filter(result=>result.status==='fulfilled').length,1)
assert.equal((await repo.get('project_a','payment_race')).journal.length,2)
console.log('PASS marketplace instructions: closed default gate, scopes/revocation, project isolation, strict request fields, atomic split release/rollback/race, canonical retry, authorization journal and private evidence redaction. Synthetic fixtures only; no financial calls.')

current={...principal,scopes:['marketplace:read']}
await assert.rejects(()=>service.cancelPayout('valid','cancel_a',{paymentId:'payment_one',operationId:'operation_a',businessReference:'cancel_order'}),/denied/)
current=principal
await assert.rejects(()=>service.cancelPayout('valid','cancel_a',{paymentId:'payment_one',operationId:'operation_a',businessReference:'cancel_order',projectId:'other_project'}),/fields/)
console.log('PASS cancellation instruction rejects missing payout authority and project override.')
