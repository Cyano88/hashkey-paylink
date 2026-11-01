import assert from 'node:assert/strict'
import {createDeveloperProjectsHandler,developerPolicyFromStore,prepareDeveloperNairaCheckout} from '../api/developer-projects.ts'
import {assertHostedLocalSettlementOrder} from '../src/lib/hostedLocalSettlement.ts'
let ownerId='merchant'
let store,eligible=true,verification='UGANDA MERCHANT',verificationCalls=[],eligibilityChecks=0
const secret='local-settlement-test-secret-at-least-thirty-two-characters'
const handler=createDeveloperProjectsHandler({hasStore:()=>true,read:async()=>store,mutate:async(_,fn)=>(store=fn(store)),verify:async()=>({userId:ownerId,email:'merchant@example.com'}),validateWebhook:async()=>{},paycrestReady:()=>true,listBanks:async currency=>currency==='UGX'?[{code:'MOMOUGPC',name:'MTN'},{code:'AIRTUGPC',name:'Airtel'}]:[{code:'OPAYNGPC',name:'OPay'}],verifyBank:async input=>{verificationCalls.push(input);return verification},requireLocalPayoutEligibility:async()=>{eligibilityChecks++;if(!eligible)throw Object.assign(Error('Complete Pocket verification.'),{status:403})},portalSecret:()=>secret,adminEmails:()=>'',adminUserIds:()=>'',createProjectId:()=> 'dev_localsettlement',createKeyId:()=> 'key_local',createSecret:p=>p+'_local-settlement-fixture',now:()=>new Date('2026-10-07T00:00:00Z')})
async function request(method,body={},query={}){const res={statusCode:200,setHeader(){return this},status(code){this.statusCode=code;return this},json(value){this.body=value;return this}};await handler({method,body,query,headers:{}},res);return res}
const project=await request('POST',{action:'create',accountType:'individual',name:'Local merchant',website:'https://merchant.example',checkoutMode:'human',useCase:'Accept customer USDC payments with local settlement.'});assert.equal(project.statusCode,201)
const config={action:'configure',projectId:project.body.project.id,name:'Local merchant',website:'https://merchant.example',useCase:'Accept customer USDC payments with local settlement.',capabilities:['hosted_checkout'],receiptEmails:{enabled:true,supportEmail:'support@example.test',timeZone:'UTC'},settlementMode:'ugx',networks:['base'],defaultNetwork:'base',recipients:{},allowedOrigins:['https://merchant.example'],refundAddress:'0x1111111111111111111111111111111111111111',bankCode:'MOMOUGPC',bankName:'MTN',bankAccountName:'UGANDA MERCHANT',bankAccountNumber:'0772123456'}
const lookup={action:'verify-bank-account',projectId:config.projectId,bankCode:'OPAYNGPC',accountNumber:'0123456789'}
const unchanged=JSON.stringify(store);verification='RESOLVED NAME';assert.equal((await request('POST',lookup)).body.accountName,'RESOLVED NAME');assert.equal(JSON.stringify(store),unchanged)
for(const patch of [{accountNumber:'123'},{accountNumber:'012345678x'},{bankCode:'MOMOUGPC'},{bankCode:'unknown'}])assert.equal((await request('POST',{...lookup,...patch})).statusCode,400)
ownerId='other-owner';const callsBefore=verificationCalls.length;assert.equal((await request('POST',lookup)).statusCode,404);assert.equal(verificationCalls.length,callsBefore);ownerId='merchant'
for(const name of ['', 'OK']){verification=name;assert.equal((await request('POST',lookup)).statusCode,503);assert.equal((await request('PUT',{...config,settlementMode:'ngn',bankCode:'OPAYNGPC',bankName:'OPay',bankAccountNumber:'0123456789',bankAccountName:'UNTRUSTED TYPED NAME'})).statusCode,503)}
const beforeSuccessfulSave=structuredClone(store);verification='BANK RETURNED NAME';const savedNgn=await request('PUT',{...config,settlementMode:'ngn',bankCode:'OPAYNGPC',bankName:'OPay',bankAccountNumber:'0123456789',bankAccountName:'UNTRUSTED TYPED NAME'});assert.equal(savedNgn.statusCode,200);assert.equal(savedNgn.body.project.bankAccountName,'BANK RETURNED NAME');store=beforeSuccessfulSave;
verification='UGANDA MERCHANT';console.log('PASS pre-save NGN account lookup: exact provider name, no persistence, validation, owner isolation, and save rejects missing provider name instead of trusting a typed name.')
assert.equal((await request('GET',{}, {resource:'institutions',currency:'KES'})).statusCode,400)
assert.deepEqual((await request('GET',{}, {resource:'institutions',currency:'UGX'})).body.institutions.map(i=>i.code),['MOMOUGPC','AIRTUGPC'])
const beforeUganda=JSON.stringify(store),beforeProvider=verificationCalls.length
const lockedUganda=await request('PUT',config)
assert.equal(lockedUganda.statusCode,403);assert.match(lockedUganda.body.error,/coming soon/)
assert.equal(JSON.stringify(store),beforeUganda);assert.equal(verificationCalls.length,beforeProvider)
// Historical payout records retain their provider-bound reconciliation support.
const policy={settlementMode:'ugx',nairaSettlement:{bankCode:'MOMOUGPC',bankName:'MTN',accountName:'UGANDA MERCHANT',accountNumber:'256772123456',refundAddress:'0x1111111111111111111111111111111111111111'}}
console.log('PASS UGX setup locked before provider calls or persistence; Nigeria setup remains available.')
const expected={id:'chk_bound',recipient:'0x1111111111111111111111111111111111111111',amount:'1.25',currency:'UGX'}
const order={intent_id:expected.id,receive_address:expected.recipient,amount_usdc:'1.250000',fiat_currency:'UGX'}
assertHostedLocalSettlementOrder(order,expected)
for(const changed of [{intent_id:'chk_other'},{receive_address:'0x2222222222222222222222222222222222222222'},{amount_usdc:'1.26'},{fiat_currency:'NGN'}])assert.throws(()=>assertHostedLocalSettlementOrder({...order,...changed},expected),/does not match/)
console.log('PASS hosted payout restoration binds order, recipient, amount and currency.')
// Quote arithmetic fixture uses a business policy; personal KYC is tested at configuration above.
const payoutPolicy={...policy,accountType:'business'}
let providerCreates=0
const provider={availability:async input=>{assert.equal(input.fiat,'UGX');assert.equal(input.network,'base');return {exact:true,rate:3900,availableUsdc:'1'}},createOrder:async input=>{providerCreates++;assert.equal(input.fiatCurrency,'UGX');assert.equal(input.amountNgn,'3900.00');assert.equal(input.bankCode,'MOMOUGPC');assert.equal(input.accountNumber,'256772123456');return {paycrest_order_id:'order_uganda',intent_id:input.intentId,amount_usdc:'1.01',amount_ngn:input.amountNgn,receive_address:expected.recipient,bank_name:'MTN',bank_last4:'3456',bank_account_name:'UGANDA MERCHANT',status:'initiated'}}}
const quote=await prepareDeveloperNairaCheckout(payoutPolicy,'chk_bound','1',provider);assert.equal(quote.payableUsdc,'1.01');assert.equal(providerCreates,1)
await assert.rejects(prepareDeveloperNairaCheckout(payoutPolicy,'chk_bound','2',{...provider,availability:async()=>({exact:false,rate:3900,availableUsdc:'1'})}),/available now/);assert.equal(providerCreates,1)
console.log('PASS provider quote and order use UGX, exact payable USDC and liquidity checks.')
