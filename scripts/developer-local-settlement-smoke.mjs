import assert from 'node:assert/strict'
import {createDeveloperProjectsHandler,developerPolicyFromStore,prepareDeveloperNairaCheckout} from '../api/developer-projects.ts'
import {assertHostedLocalSettlementOrder} from '../src/lib/hostedLocalSettlement.ts'
let store,eligible=true,verification='UGANDA MERCHANT',verificationCalls=[],eligibilityChecks=0
const secret='local-settlement-test-secret-at-least-thirty-two-characters'
const handler=createDeveloperProjectsHandler({hasStore:()=>true,read:async()=>store,mutate:async(_,fn)=>(store=fn(store)),verify:async()=>({userId:'merchant',email:'merchant@example.com'}),validateWebhook:async()=>{},paycrestReady:()=>true,listBanks:async currency=>currency==='UGX'?[{code:'MOMOUGPC',name:'MTN'},{code:'AIRTUGPC',name:'Airtel'}]:[{code:'OPAYNGPC',name:'OPay'}],verifyBank:async input=>{verificationCalls.push(input);return verification},requireLocalPayoutEligibility:async()=>{eligibilityChecks++;if(!eligible)throw Object.assign(Error('Complete Pocket verification.'),{status:403})},portalSecret:()=>secret,adminEmails:()=>'',adminUserIds:()=>'',createProjectId:()=> 'dev_localsettlement',createKeyId:()=> 'key_local',createSecret:p=>p+'_local-settlement-fixture',now:()=>new Date('2026-10-07T00:00:00Z')})
async function request(method,body={},query={}){const res={statusCode:200,setHeader(){return this},status(code){this.statusCode=code;return this},json(value){this.body=value;return this}};await handler({method,body,query,headers:{}},res);return res}
const project=await request('POST',{action:'create',name:'Local merchant',website:'https://merchant.example',checkoutMode:'human',useCase:'Accept customer USDC payments with local settlement.'});assert.equal(project.statusCode,201)
const config={action:'configure',projectId:project.body.project.id,name:'Local merchant',website:'https://merchant.example',useCase:'Accept customer USDC payments with local settlement.',capabilities:['hosted_checkout'],settlementMode:'ugx',networks:['base'],defaultNetwork:'base',recipients:{},allowedOrigins:['https://merchant.example'],refundAddress:'0x1111111111111111111111111111111111111111',bankCode:'MOMOUGPC',bankName:'MTN',bankAccountName:'UGANDA MERCHANT',bankAccountNumber:'0772123456'}
assert.equal((await request('GET',{}, {resource:'institutions',currency:'KES'})).statusCode,400)
assert.deepEqual((await request('GET',{}, {resource:'institutions',currency:'UGX'})).body.institutions.map(i=>i.code),['MOMOUGPC','AIRTUGPC'])
eligible=false;assert.equal((await request('PUT',config)).statusCode,403);assert.equal(store.projects[config.projectId].settlementMode,'usdc');eligible=true
assert.equal((await request('PUT',{...config,bankCode:'OPAYNGPC'})).statusCode,400)
assert.equal((await request('PUT',{...config,bankAccountNumber:'1234'})).statusCode,400)
verification='';assert.equal((await request('PUT',config)).statusCode,503);assert.equal(store.projects[config.projectId].settlementMode,'usdc')
verification='OK';assert.equal((await request('PUT',{...config,bankAccountName:''})).statusCode,400)
const ug=await request('PUT',config);assert.equal(ug.statusCode,200);assert.equal(ug.body.project.settlementMode,'ugx');assert.deepEqual(ug.body.project.networks,['base']);assert.equal(ug.body.project.bankAccountLast4,'3456');assert.ok(ug.body.project.bankVerifiedAt);assert.ok(!JSON.stringify(ug.body).includes('256772123456'));assert.deepEqual(verificationCalls.at(-1),{institution:'MOMOUGPC',accountIdentifier:'256772123456',currency:'UGX'});assert.ok(eligibilityChecks>0)
const key=await request('POST',{action:'create-key',projectId:config.projectId,name:'Local payments',environment:'live'});assert.equal(key.statusCode,201)
const policy=developerPolicyFromStore(store,key.body.apiKey,secret);assert.equal(policy.settlementMode,'ugx');assert.equal(policy.nairaSettlement.accountNumber,'256772123456');assert.equal(policy.defaultNetwork,'base')
const noAccount={...config,bankAccountNumber:''}
assert.equal((await request('PUT',{...noAccount,bankCode:'AIRTUGPC',bankName:'Airtel'})).statusCode,400)
assert.equal((await request('PUT',{...noAccount,settlementMode:'ngn',bankCode:'OPAYNGPC',bankName:'OPay'})).statusCode,400)
assert.equal((await request('PUT',noAccount)).statusCode,200)
assert.equal((await request('PUT',{...config,xlayerCheckout:{recipient:'0x2222222222222222222222222222222222222222',assets:['0xb6ceceab302e2e4948951ee7843fc24e92933061']}})).statusCode,400)
console.log('PASS local settlement: country/provider binding, Uganda number normalization, identity eligibility, provider failure, protected account details and Base-only routing.')
const expected={id:'chk_bound',recipient:'0x1111111111111111111111111111111111111111',amount:'1.25',currency:'UGX'}
const order={intent_id:expected.id,receive_address:expected.recipient,amount_usdc:'1.250000',fiat_currency:'UGX'}
assertHostedLocalSettlementOrder(order,expected)
for(const changed of [{intent_id:'chk_other'},{receive_address:'0x2222222222222222222222222222222222222222'},{amount_usdc:'1.26'},{fiat_currency:'NGN'}])assert.throws(()=>assertHostedLocalSettlementOrder({...order,...changed},expected),/does not match/)
console.log('PASS hosted payout restoration binds order, recipient, amount and currency.')
let providerCreates=0
const provider={availability:async input=>{assert.equal(input.fiat,'UGX');assert.equal(input.network,'base');return {exact:true,rate:3900,availableUsdc:'1'}},createOrder:async input=>{providerCreates++;assert.equal(input.fiatCurrency,'UGX');assert.equal(input.amountNgn,'3900.00');assert.equal(input.bankCode,'MOMOUGPC');assert.equal(input.accountNumber,'256772123456');return {paycrest_order_id:'order_uganda',intent_id:input.intentId,amount_usdc:'1.01',amount_ngn:input.amountNgn,receive_address:expected.recipient,bank_name:'MTN',bank_last4:'3456',bank_account_name:'UGANDA MERCHANT',status:'initiated'}}}
const quote=await prepareDeveloperNairaCheckout(policy,'chk_bound','1',provider);assert.equal(quote.payableUsdc,'1.01');assert.equal(providerCreates,1)
await assert.rejects(prepareDeveloperNairaCheckout(policy,'chk_bound','2',{...provider,availability:async()=>({exact:false,rate:3900,availableUsdc:'1'})}),/available now/);assert.equal(providerCreates,1)
console.log('PASS provider quote and order use UGX, exact payable USDC and liquidity checks.')
