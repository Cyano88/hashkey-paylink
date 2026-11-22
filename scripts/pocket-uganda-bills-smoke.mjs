import assert from 'node:assert/strict'
import {internationalVariations,priceInternationalBill} from '../api/vtpass-international.ts'
import {normalizeUgandaPhone,normalizeKenyaPhone,billDestination} from '../src/pocket/lib/pocketBillCountry.ts'
import {createVtpassClient} from '../api/vtpass-client.ts'
import {readVtpassPhase0Config} from '../api/vtpass-config.ts'
import {parsePocketDataBundles} from '../src/pocket/lib/pocketDataBundles.ts'
const fixed={variation_code:'5200',name:'MTN UGX250.00 - Daily 30MB Mobile Data',fixedPrice:'Yes',variation_amount:'250',variation_amount_min:'250',variation_amount_max:'250',variation_rate:0.39612,charged_amount:'99.03',charged_currency:'NGN'}
const flexible={...fixed,variation_code:'3028',name:'Enter flexible amount',fixedPrice:'No',variation_amount:null,variation_amount_min:50,variation_amount_max:504795,variation_rate:0.3962,charged_amount:null}
const plans=internationalVariations({currency:'UGX',variations:[fixed,{...fixed,name:'MTN Daily 30 SMS Bundle'},{...fixed,charged_currency:'UGX'}]},'4','UGX')
assert.equal(plans.length,1);assert.deepEqual(priceInternationalBill(plans[0],'1','UGX'),{deliveryAmount:'250.00',amountNgn:'99.03'})
const airtime=internationalVariations({currency:'UGX',variations:[flexible]},'1','UGX')[0]
assert.deepEqual(priceInternationalBill(airtime,'1000','UGX'),{deliveryAmount:'1000.00',amountNgn:'396.20'})
for(const invalid of ['0','49','999999999999','NaN','-50'])assert.throws(()=>priceInternationalBill(airtime,invalid,'UGX'))
for(const phone of ['0700000000','+256700000000','256700000000'])assert.equal(normalizeUgandaPhone(phone),'256700000000')
assert.equal(normalizeUgandaPhone('08123456789'),'');assert.equal(billDestination('KE'),'KE')
for(const phone of ['0712345678','0112345678','+254712345678','254112345678'])assert.match(normalizeKenyaPhone(phone),/^254[17]\d{8}$/)
assert.equal(normalizeKenyaPhone('08123456789'),'')
const kenyaVariation=internationalVariations({currency:'KES',variations:[{...fixed,name:'Safaricom KES250 Data 1GB',variation_amount:'250',charged_amount:'99.03'}]},'4','KES')[0]
assert.deepEqual(priceInternationalBill(kenyaVariation,'250','KES'),{deliveryAmount:'250.00',amountNgn:'99.03'})
const parsed=parsePocketDataBundles([{variationCode:'5200',name:fixed.name,amountNgn:'99.03',amountLocal:'250.00',currency:'UGX',available:true}],'ug-15')
assert.equal(parsed[0].price,250);assert.equal(parsed[0].category,'daily')
const now=new Date('2026-09-29T10:00:00Z'),calls=[]
const config=readVtpassPhase0Config({VTPASS_API_KEY:'fixture',VTPASS_PUBLIC_KEY:'fixture',VTPASS_SECRET_KEY:'fixture'})
const client=createVtpassClient({config:{...config,canVend:true},now:()=>now,fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({code:'000',requestId:'202609291100fixture',content:{transactions:{status:'delivered',unique_element:'256700000000',amount:396.2}}}))}})
const input={international:{country:'UG',operatorId:'246',productTypeId:'1',deliveryCurrency:'UGX',deliveryAmount:'1000.00'},variationCode:'3028',phone:'0700000000',requestId:'202609291100fixture',email:'fixture@example.com'}
await client.purchaseInternational(input)
const payload=JSON.parse(calls[0].options.body)
assert.equal(payload.amount,1000);assert.equal(payload.country_code,'UG');assert.equal(payload.serviceID,'foreign-airtime');assert.equal(payload.billersCode,'256700000000');assert.equal(payload.operator_id,'246');assert.equal(payload.product_type_id,'1');assert.equal(payload.variation_code,'3028')
assert.equal(calls[0].options.headers['secret-key'],'fixture');assert.equal(calls[0].options.headers['public-key'],undefined)
await assert.rejects(client.purchaseInternational({...input,email:''}));assert.equal(calls.length,1)
console.log('PASS UG and KE international catalogue validation, local face values, NGN provider pricing, phone normalization, data classification and provider payload; no real requests.')
