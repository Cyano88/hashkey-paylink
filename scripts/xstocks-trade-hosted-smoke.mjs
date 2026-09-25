import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createXStocksAgreementHandlers} from '../api/xstocks-agreement/http.ts'
import {parseTradeCheckout,prepareTradeCheckoutBinding} from '../api/xstocks-agreement/trade.ts'
import {prepareWorkBinding} from '../api/xstocks-agreement/work.ts'
const stock=JSON.parse(readFileSync('src/lib/xstocksAgreement/xStocksCatalog.json','utf8')).assets[0]
const env={HASHPAYLINK_XSTOCKS_SHARE_ENABLED:'true',HASHPAYLINK_XSTOCKS_SHARE_FACTORY:'0x'+'55'.repeat(20),PRIVY_APP_ID:'fixture-app-id',PRIVY_APP_SECRET:'fixture-only',HASHPAYLINK_AGREEMENT_XSTOCKS_ENABLED:'true',HASHPAYLINK_TRADE_XSTOCKS_ENABLED:'true',HASHPAYLINK_TRADE_XSTOCKS_PROJECTS:'project-a',HASHPAYLINK_AGREEMENT_XSTOCKS_ASSETS_JSON:JSON.stringify([{address:stock.address,decimals:18}])}
const trade={offerId:'11111111-1111-4111-8111-111111111111',listingRevision:1,snapshotHash:'a'.repeat(64),price:'1.00',deliveryFee:'0.25',handover:'Delivery',location:'Lagos',carrier:'Agreed courier',returns:'Return if materially different from listing.',dispatchDays:3,deliveryDays:12,inspectionHours:48}
const body={kind:'trade',stockCustody:'xstocks-shares-v2',title:'Synthetic item',description:'Preserved item description',amount:'1.25',paymentToken:stock.address,customerUserId:'did:privy:buyer',providerUserId:'did:privy:seller',trade}
const terms=parseTradeCheckout(body,env),buyer='0x'+'11'.repeat(20),seller='0x'+'22'.repeat(20)
const binding=prepareTradeCheckoutBinding('fixture',terms,buyer,seller,100)
assert.equal(binding.contractTerms.deliveryWindow,12*86400)
assert.equal(binding.contractTerms.dispatchWindow,3*86400)
assert.equal(binding.contractTerms.inspectionWindow,48*3600)
assert.equal(binding.contractTerms.amount,'1250000000000000000')
assert.notEqual(binding.termsHash,prepareWorkBinding('fixture',terms,buyer,seller,100).termsHash)
for(const change of [{amount:'1.00'},{trade:{...trade,deliveryDays:61}},{trade:{...trade,handover:'Pickup'}},{trade:{...trade,returns:'short'}},{trade:{...trade,snapshotHash:'invalid'}}])assert.throws(()=>parseTradeCheckout({...body,...change},env))
const small={...body,amount:'0.00223',trade:{...trade,price:'0.00223',deliveryFee:'0',handover:'Pickup'}}
assert.equal(parseTradeCheckout(small,env).xlayerPayment.amountUnits,'2230000000000000')
assert.equal(parseTradeCheckout({...small,amount:'0.01000',trade:{...trade,price:'0.00999',deliveryFee:'0.00001'}},env).xlayerPayment.amountUnits,'10000000000000000')
assert.throws(()=>parseTradeCheckout({...small,amount:'0.00224'},env))
assert.throws(()=>parseTradeCheckout({...small,amount:'0.0000000000000000001',trade:{...small.trade,price:'0.0000000000000000001'}},env))
assert.throws(()=>parseTradeCheckout({...small,amount:'0.0000001',trade:{...small.trade,price:'0.0000001'}},{...env,HASHPAYLINK_AGREEMENT_XSTOCKS_ASSETS_JSON:JSON.stringify([{address:stock.address,decimals:6}])}))
const store=new Map();let who='did:privy:buyer',project='project-a'
const h=createXStocksAgreementHandlers({env:()=>env,hasStore:()=>true,now:()=>new Date('2026-09-25T12:00:00Z'),policy:async()=>({partnerId:project,environment:'live',checkoutMode:'human',capabilities:['xstocks_agreements']}),projectEnabled:async()=>true,identity:async()=>who,wallet:async()=>({address:who.endsWith('buyer')?buyer:seller,chainId:196}),read:async key=>structuredClone(store.get(key)),mutate:async(key,fn)=>{const r=fn(structuredClone(store.get(key)));store.set(key,structuredClone(r));return r},plan:async()=>({enabled:true,actions:['refund'],state:2,observedBlock:'100'})})
async function call(handler,body={},method='POST',query={}){const res={statusCode:200,setHeader(){},status(c){this.statusCode=c;return this},json(b){this.body=b;return this}};await handler({method,headers:{'idempotency-key':'trade_fixture_00001'},body,query},res);return res}
let created=await call(h.developer,body);assert.equal(created.statusCode,201)
const a=created.body.agreement
assert.equal((await call(h.developer,{},'GET',{idempotencyKey:'trade_fixture_00001'})).body.agreement.id,a.id)
project='project-b';assert.equal((await call(h.developer,body)).statusCode,409);assert.equal((await call(h.developer,{},'GET',{idempotencyKey:'trade_fixture_00001'})).statusCode,404);project='project-a'
assert.equal((await call(h.developer,{...body,trade:{...trade,deliveryDays:13}})).statusCode,409)
assert.equal((await call(h.participant,{agreementId:a.id,action:'accept_terms',consentHash:a.consentHash,address:buyer})).statusCode,200)
who='did:privy:seller';created=await call(h.participant,{agreementId:a.id,action:'accept_terms',consentHash:a.consentHash,address:seller});assert.equal(created.statusCode,200);assert.equal(created.body.agreement.binding.contractTerms.deliveryWindow,12*86400)
env.HASHPAYLINK_TRADE_XSTOCKS_ENABLED='false'
assert.equal((await call(h.developer,body)).statusCode,409)
assert.equal((await call(h.participant,{agreementId:a.id,action:'prepare',operation:'fund'})).statusCode,409)
assert.equal((await call(h.participant,{agreementId:a.id,action:'prepare',operation:'refund',evidence:'Return the item payment'})).statusCode,200)
assert.equal((await call(h.developer,{},'GET',{idempotencyKey:'trade_fixture_00001'})).statusCode,200)
console.log('Hosted Trade passed: exact totals, separate binding, delivery deadlines, project isolation, idempotent lookup, exact participant consent and paused recovery.')
