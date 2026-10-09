import assert from 'node:assert/strict'
import {createPocketBillsStore} from '../api/pocket/bills-store.ts'
import {createPocketBillsUserRefundHandler} from '../api/pocket/bills-refunds.ts'
import {readVtpassPhase0Config} from '../api/vtpass-config.ts'
import {readCircleTreasuryConfig} from '../api/circle-developer-treasury.ts'
import {BASE_STABLECOINS} from '../src/lib/baseStablecoins.ts'
import {paymentToken} from '../api/pocket/payment-asset.ts'
import {parsePocketBillIntent,quotePocketAirtime} from '../src/pocket/api/pocketBillsClient.ts'
const treasury='0x'+'1'.repeat(40),payer='0x'+'2'.repeat(40),hash='0x'+'3'.repeat(64)
const env={VTPASS_ENVIRONMENT:'sandbox',VTPASS_API_KEY:'fixture',VTPASS_PUBLIC_KEY:'PK_fixture',VTPASS_SECRET_KEY:'SK_fixture',POCKET_BILLS_ENABLED:'true',VTPASS_SANDBOX_VENDING_ENABLED:'true',VTPASS_AIRTIME_WHITELIST_CONFIRMED:'true',POCKET_BILLS_REFUNDS_READY:'true',POCKET_BILLS_TREASURY_ADDRESS:treasury,VTPASS_MINIMUM_WALLET_BALANCE_NGN:'5000',CIRCLE_BASE_URL:'https://api.circle.com',CIRCLE_API_KEY:'TEST_API_KEY',CIRCLE_ENTITY_SECRET:'ab'.repeat(32),POCKET_BILLS_TREASURY_WALLET_SET_ID:'11111111-1111-5111-8111-111111111111',POCKET_BILLS_TREASURY_WALLET_ID:'22222222-2222-5222-8222-222222222222'}
let stored,queue=Promise.resolve()
const storage={ready:()=>true,read:async()=>structuredClone(stored),mutate:async(_key,fn)=>{const work=queue.then(async()=>{stored=await fn(structuredClone(stored));return structuredClone(stored)});queue=work.catch(()=>{});return work}}
const config=readVtpassPhase0Config(env),circleConfig=readCircleTreasuryConfig(env)
const store=createPocketBillsStore({config,storage})
const input={asset:'USDT',ownerId:'owner',idempotencyKey:'bills-usdt-regression-0001',serviceId:'mtn',serviceName:'MTN',phone:'08011111111',amountNgn:'100',amountUsdc:'1',chargePlatformFee:true,fxRateNgnPerUsdc:'100',payerWallet:payer,quoteExpiresAt:Date.now()+60000}
const {intent}=await store.createQuote(input)
assert.equal(intent.asset,'USDT');assert.equal(intent.amountUsdc,'1.0025')
assert.equal((await store.createQuote(input)).created,false)
await assert.rejects(store.createQuote({...input,asset:'USDC'}),/different|match|already/i)
await assert.rejects(store.createQuote({...input,asset:'BAD'}),/Unsupported/)
const legacy=await store.createQuote({...input,asset:undefined,idempotencyKey:'bills-usdc-regression-0001'})
assert.equal(legacy.intent.asset??'USDC','USDC')
const token={chainId:8453,address:BASE_STABLECOINS.USDT.address,symbol:'USDT',decimals:6}
assert.equal(paymentToken(token,'base','base').symbol,'USDT')
assert.throws(()=>paymentToken({...token,address:BASE_STABLECOINS.USDC.address},'base','base'))
assert.throws(()=>paymentToken(token,'arc','base'))
await store.recordVerifiedPayment({ownerId:'owner',intentId:intent.id,txHash:hash,paymentAmountUsdc:intent.amountUsdc})
await store.claimVending('owner',intent.id)
const failure={status:'failed',providerCode:'099',providerStatus:'failed',responseDescription:'FAILED',requestId:intent.requestId,transactionId:'provider-test',productName:'MTN',recipient:input.phone,amountNgn:100,purchasedCode:'',retryable:false,requeryRequired:false}
await store.recordProviderResult('owner',intent.id,failure,{requery:true})
let submitted=0,verified=0,acceptToken=false
const handler=createPocketBillsUserRefundHandler({billsConfig:config,circleConfig,store,verifyUser:async()=>({userId:'owner'}),provider:{requeryTransaction:async()=>failure},circle:{verifyConfiguredWallet:async()=>({}),createUsdcTransfer:async request=>{submitted++;assert.equal(request.tokenAddress,BASE_STABLECOINS.USDT.address);assert.equal(request.destinationAddress,payer);assert.equal(request.amount,'1.0025');return{id:'33333333-3333-5333-8333-333333333333'}},getTransaction:async()=>({id:'33333333-3333-5333-8333-333333333333',blockchain:'BASE',state:'CONFIRMED',transactionType:'OUTBOUND',walletId:circleConfig.walletId,sourceAddress:treasury,destinationAddress:payer,amounts:['1.0025'],refId:'pocket-bills-refund:'+intent.id,txHash:'0x'+'4'.repeat(64)})},verifyTransfer:async request=>{verified++;assert.equal(request.token,'USDT');assert.equal(request.recipient,payer);if(!acceptToken)throw Error('No matching USDT transfer');return{amount:'1.0025',amountUnits:'1002500'}}})
async function refund(){const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};await handler({method:'POST',body:{intent_id:intent.id},headers:{}},res);return res}
await refund()
assert.notEqual((await store.getOwnedIntent('owner',intent.id)).state,'refunded','Circle completion alone is not asset-specific refund proof')
assert.equal(submitted,1)
acceptToken=true
const result=await refund()
assert.equal(result.statusCode,200);assert.equal(result.body.data.intent.state,'refunded');assert.equal(result.body.data.intent.asset,'USDT')
await refund();assert.equal(submitted,1);assert.equal(verified,2)
assert.equal(parsePocketBillIntent(result.body.data.intent).asset,'USDT')
await assert.rejects(quotePocketAirtime({asset:'USDT',accessToken:'fixture',serviceId:'mtn',phone:input.phone,amountNgn:'100',payerWallet:payer,fetcher:async(_url,init)=>{assert.equal(JSON.parse(init.body).asset,'USDT');return new Response(JSON.stringify({ok:true,data:{intent:legacy.intent}}))}}),/selected asset/)
console.log('PASS USDT bill fees, asset-bound retries, legacy USDC, exact-token refunds, wrong-token proof rejection, refund idempotency and client binding. No live funds moved.')
