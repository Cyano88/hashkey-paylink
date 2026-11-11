import assert from 'node:assert/strict'
import {createMarketplaceBankQuoteService} from '../api/marketplace/bank-quote-service.ts'
import {createMarketplacePaycrestQuoteVerifier} from '../api/marketplace/paycrest-quotes.ts'
let now=1000000,store={requests:[]},calls=0,fail=false,senderFee='0',orders={}
const holding={id:'holding_one',revision:'revision_one',address:'0x'+'11'.repeat(20),billsAddress:'0x'+'33'.repeat(20)},funding='0x'+'22'.repeat(20)
const bank={projectId:'project_one',sellerId:'seller_one',beneficiaryId:'bank_one',kind:'bank',network:'base',asset:'USDC',currency:'NGN',status:'active',ownershipEvidenceId:'proof_one',destinationDigest:'a'.repeat(64)},details={bankCode:'TEST',accountNumber:'0123456789',accountName:'Seller Test'}
const plan={sellerId:'seller_one',role:'seller',beneficiary:bank,sources:[{paymentId:'payment_one',allocationId:'share_one',units:'1110000'}]}
const verifyQuote=createMarketplacePaycrestQuoteVerifier({now:()=>now,holding,readBank:async()=>bank,decrypt:()=>details,readOrder:async id=>orders[id]})
const deps={read:async()=>structuredClone(store),mutate:async fn=>{store=fn(structuredClone(store));return structuredClone(store)},now:()=>now,holding,verifySeller:async()=>details,networkFee:async()=>10000n,verifyQuote,createOrder:async i=>{calls++;if(fail)throw Error('lost response');const id='provider_'+calls;return orders[id]={id,status:'initiated',amount:i.amount,transactionFee:'0.1',senderFee,senderFeePercent:'0',rate:'1500',amountPaid:'0',amountReturned:'0',percentSettled:'0',source:{type:'crypto',currency:'USDC',network:'base',refundAddress:holding.address},destination:{type:'fiat',currency:'NGN',recipient:{institution:details.bankCode,accountIdentifier:details.accountNumber,accountName:details.accountName}},providerAccount:{network:'base',currency:'USDC',receiveAddress:funding,validUntil:new Date(now+300000).toISOString()}}}}
const svc=createMarketplaceBankQuoteService(deps),input={projectId:'project_one',operationId:'withdrawal_one',debitUnits:'1110000',plan}
const q=await svc.quote(input);assert.equal(calls,2);assert.equal(q.netUnits,'1000000');assert.equal(q.ngnMinor,'150000');assert.equal(q.fundingUnits,'1100000');assert.equal(q.debitUnits,'1110000')
assert.deepEqual(await svc.quote(input),q);assert.equal(calls,2)
await assert.rejects(()=>svc.quote({...input,debitUnits:'1120000'}),/different terms/)
assert.equal(await svc.resolve('other_project','payment_one',q.quoteId),null)
orders[q.providerOrderId].senderFee='0.01';await assert.rejects(()=>svc.resolve('project_one','payment_one',q.quoteId),/duplicate/);orders[q.providerOrderId].senderFee='0'
fail=true;await assert.rejects(()=>svc.quote({...input,operationId:'lost_one'}),/lost response/);const before=calls;await assert.rejects(()=>svc.quote({...input,operationId:'lost_one'}),/unresolved or failed/);assert.equal(calls,before)
fail=false;senderFee='0.01';await assert.rejects(()=>svc.quote({...input,operationId:'extra_fee'}),/fee policy/)
await assert.rejects(()=>svc.quote({...input,operationId:'small_one',debitUnits:'999999'}),/minimum|at least/i)
assert.equal(JSON.stringify(store).includes(details.accountNumber),false)
console.log('PASS bank quote exact total debit, provider fee and gas, zero duplicate commission, minimum, scope, immutable retry, ambiguous-create no retry, encrypted recipient only (provider fixtures).')
const commissionFailure=store.requests.find(r=>r.operationId==='extra_fee');assert.equal(commissionFailure.failure.code,'MARKETPLACE_BANK_COMMISSION_NOT_ZERO');assert.equal(commissionFailure.failure.details.commissionUnits,'10000')
const countBefore=calls;await assert.rejects(()=>svc.quote({...input,operationId:'extra_fee'}),e=>e.failure.code==='MARKETPLACE_BANK_COMMISSION_NOT_ZERO');assert.equal(calls,countBefore)
senderFee='0';await assert.rejects(()=>svc.quote({...input,operationId:'fee_shortfall',debitUnits:'1000000'}),e=>e.failure.code==='MARKETPLACE_BANK_FEE_SHORTFALL'&&e.failure.details.estimatedShortfallUnits==='110000'&&e.failure.details.estimateOnly===true)
assert.equal(store.requests.find(r=>r.operationId==='fee_shortfall').state,'failed')
console.log('PASS structured commission/fee shortfall, exact integer estimate and durable retry without another provider order.')
