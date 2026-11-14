import assert from 'node:assert/strict'
import {withBankQuoteRecovery} from '../api/marketplace/bank-quote-recovery.ts'
import {bankRequoteRequired} from '../api/marketplace/bank-gas-policy.ts'
const refs=['project_one','payment_one','operation_one','worker_one'],failure=bankRequoteRequired()
const store={books:[{plan:{projectId:refs[0],paymentId:refs[1]},bankReservations:[{quote:{operationId:refs[2]},authorization:{credentialId:'credential_one'}}]}]}
let calls=0
const cancel=async(...args)=>{calls++;assert.deepEqual(args,[...refs.slice(0,2),'requote:operation_one',refs[2],{credentialId:'credential_one',businessReference:'withdrawal_fee_changed'}])}
const submit=withBankQuoteRecovery(async()=>{throw failure},cancel,async()=>store)
await assert.rejects(()=>submit(...refs),e=>e===failure);assert.equal(calls,1)
await assert.rejects(()=>submit('other_project',...refs.slice(1)));assert.equal(calls,1)
await assert.rejects(()=>withBankQuoteRecovery(async()=>{throw Error('Ambiguous transfer response')},cancel,async()=>store)(...refs),/Ambiguous/);assert.equal(calls,1)
await assert.rejects(()=>withBankQuoteRecovery(async()=>{throw failure},async()=>{throw Error('Payout may have been submitted')},async()=>store)(...refs),/may have been submitted/)
assert.equal(await withBankQuoteRecovery(async()=>({state:'submitted'}),cancel,async()=>store)(...refs).then(x=>x.state),'submitted');assert.equal(calls,1)
console.log('PASS quote-refresh cancellation is project/operation scoped, uses the original authority, leaves ambiguous/submitted transfers untouched, and preserves cancellation guards.')

const {createMarketplaceInstructions}=await import('../api/marketplace/instructions.ts')
const instructions=createMarketplaceInstructions({enabled:true,repository:{get:async()=>({plan:{projectId:'project_one'},balances:[],operations:[{id:'operation_one',status:'failed'}],payoutCancellations:[{operationId:'operation_one',authorization:{businessReference:'withdrawal_fee_changed'}}]})},resolvePrincipal:async()=>({projectId:'project_one',credentialId:'credential_one',active:true,capabilities:['marketplace_payments'],scopes:['marketplace:read']})})
const payment=await instructions.payment('credential','payment_one')
assert.equal(payment.operations[0].code,'MARKETPLACE_BANK_REQUOTE_REQUIRED');assert.equal(payment.operations[0].quoteRequired,true);assert.equal(payment.operations[0].approvalRequired,true)
assert.equal(JSON.stringify(payment).includes('coverageId'),false)
console.log('PASS authenticated payment status exposes renewed quote/approval requirement without internal gas evidence.')
