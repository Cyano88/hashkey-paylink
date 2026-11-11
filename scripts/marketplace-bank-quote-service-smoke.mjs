import {formatUnits,parseUnits} from 'viem'
import {marketplaceBankCommission} from '../api/marketplace/bank-commission.ts'
import assert from 'node:assert/strict'
import {createMarketplaceBankQuoteService} from '../api/marketplace/bank-quote-service.ts'
import {createMarketplacePaycrestQuoteVerifier} from '../api/marketplace/paycrest-quotes.ts'
let now=1000000,store={requests:[]},calls=0,fail=false,senderFee=null,orders={},providerFee='0.1',gas=10000n
const holding={id:'holding_one',revision:'revision_one',address:'0x'+'11'.repeat(20),billsAddress:'0x'+'33'.repeat(20)},funding='0x'+'22'.repeat(20)
const bank={projectId:'project_one',sellerId:'seller_one',beneficiaryId:'bank_one',kind:'bank',network:'base',asset:'USDC',currency:'NGN',status:'active',ownershipEvidenceId:'proof_one',destinationDigest:'a'.repeat(64)},details={bankCode:'TEST',accountNumber:'0123456789',accountName:'Seller Test'}
const plan={sellerId:'seller_one',role:'seller',beneficiary:bank,sources:[{paymentId:'payment_one',allocationId:'share_one',units:'1113000'}]}
const verifyQuote=createMarketplacePaycrestQuoteVerifier({now:()=>now,holding,readBank:async()=>bank,decrypt:()=>details,readOrder:async id=>orders[id]})
const deps={read:async()=>structuredClone(store),mutate:async fn=>{store=fn(structuredClone(store));return structuredClone(store)},now:()=>now,holding,verifySeller:async()=>details,networkFee:async()=>gas,verifyQuote,createOrder:async i=>{calls++;if(fail)throw Error('lost response');const id='provider_'+calls;return orders[id]={id,status:'initiated',amount:i.amount,transactionFee:providerFee,senderFee:senderFee??formatUnits(marketplaceBankCommission(parseUnits(i.amount,6)),6),senderFeePercent:'',rate:'1500',amountPaid:'0',amountReturned:'0',percentSettled:'0',source:{type:'crypto',currency:'USDC',network:'base',refundAddress:holding.address},destination:{type:'fiat',currency:'NGN',recipient:{institution:details.bankCode,accountIdentifier:details.accountNumber,accountName:details.accountName}},providerAccount:{network:'base',currency:'USDC',receiveAddress:funding,validUntil:new Date(now+300000).toISOString()}}}}
const svc=createMarketplaceBankQuoteService(deps),input={projectId:'project_one',operationId:'withdrawal_one',debitUnits:'1113000',plan}
const q=await svc.quote(input);assert.equal(calls,2);assert.equal(q.netUnits,'1000000');assert.equal(q.ngnMinor,'150000');assert.equal(q.fundingUnits,'1103000');assert.equal(q.debitUnits,'1113000')
assert.deepEqual(await svc.quote(input),q);assert.equal(calls,2)
await assert.rejects(()=>svc.quote({...input,debitUnits:'1120000'}),/different terms/)
assert.equal(await svc.resolve('other_project','payment_one',q.quoteId),null)
orders[q.providerOrderId].senderFee='0.01';await assert.rejects(()=>svc.resolve('project_one','payment_one',q.quoteId),/commission/);orders[q.providerOrderId].senderFee='0.003'
fail=true;await assert.rejects(()=>svc.quote({...input,operationId:'lost_one'}),/lost response/);const before=calls;await assert.rejects(()=>svc.quote({...input,operationId:'lost_one'}),/unresolved or failed/);assert.equal(calls,before)
fail=false;senderFee='0.01';await assert.rejects(()=>svc.quote({...input,operationId:'extra_fee'}),/commission/)
await assert.rejects(()=>svc.quote({...input,operationId:'small_one',debitUnits:'999999'}),/minimum|at least/i)
assert.equal(JSON.stringify(store).includes(details.accountNumber),false)
console.log('PASS bank quote exact total debit, provider fee and gas, explicit 0.3% commission, minimum, scope, immutable retry, ambiguous-create no retry, encrypted recipient only (provider fixtures).')
const commissionFailure=store.requests.find(r=>r.operationId==='extra_fee');assert.equal(commissionFailure.failure.code,'MARKETPLACE_BANK_COMMISSION_MISMATCH');assert.equal(commissionFailure.failure.details.commissionUnits,'10000')
const countBefore=calls;await assert.rejects(()=>svc.quote({...input,operationId:'extra_fee'}),e=>e.failure.code==='MARKETPLACE_BANK_COMMISSION_MISMATCH');assert.equal(calls,countBefore)
senderFee=null;await assert.rejects(()=>svc.quote({...input,operationId:'fee_shortfall',debitUnits:'1000000'}),e=>e.failure.code==='MARKETPLACE_BANK_FEE_SHORTFALL'&&e.failure.details.estimatedShortfallUnits==='113000'&&e.failure.details.estimateOnly===true)
assert.equal(store.requests.find(r=>r.operationId==='fee_shortfall').state,'failed')
console.log('PASS structured commission/fee shortfall, exact integer estimate and durable retry without another provider order.')

assert.equal(q.commissionUnits,'3000');assert.equal(q.commissionRateBps,30);assert.equal(q.feeUnits,'103000')

// Reproduce the live 1.05 budget with exact micro-USDC commission and gas.
providerFee='0.02';gas=4148n
const exact=await svc.quote({...input,operationId:'micro_precision',debitUnits:'1050000',plan:{...plan,sources:[{...plan.sources[0],units:'1050000'}]}})
assert.equal(exact.netUnits,'1022784');assert.equal(exact.commissionUnits,'3068');assert.equal(exact.debitUnits,'1050000');assert.equal(exact.commissionMode,'fixed_units')
orders[exact.providerOrderId].senderFeePercent='0.3'
assert.deepEqual(await svc.resolve('project_one','payment_one',exact.quoteId),exact)
orders[exact.providerOrderId].senderFee='0.0031'
await assert.rejects(()=>svc.resolve('project_one','payment_one',exact.quoteId),/commission/)
console.log('PASS live-budget regression: exact 1.05 debit, micro-USDC commission, create/read percentage metadata variation and rounded fee rejection.')

const changingGas=[4200n,4100n,4150n];let estimates=0
const variable=createMarketplaceBankQuoteService({...deps,networkFee:async()=>changingGas[Math.min(estimates++,2)]})
const stable=await variable.quote({...input,operationId:'falling_gas',debitUnits:'1050000',plan:{...plan,sources:[{...plan.sources[0],units:'1050000'}]}})
assert.equal(stable.debitUnits,'1050000');assert.equal(stable.networkFeeUnits,'4200');assert.equal(estimates,2)
assert.equal(stable.netUnits,'1022732');assert.equal(stable.commissionUnits,'3068')
console.log('PASS bounded gas quote retains the largest observed estimate and converges without chasing a lower estimate.')
