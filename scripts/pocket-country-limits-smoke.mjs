import assert from 'node:assert/strict'
import {readBillCountryLimits} from '../api/pocket/bill-country-limits.ts'
import {createPocketBillsStore} from '../api/pocket/bills-store.ts'
import {readVtpassPhase0Config} from '../api/vtpass-config.ts'
let data,queue=Promise.resolve(),time=Date.parse('2026-11-15T10:00:00Z'),id=0
const storage={ready:()=>true,read:async()=>structuredClone(data),mutate:async(_key,fn)=>{const work=queue.then(async()=>{data=structuredClone(await fn(structuredClone(data)));return structuredClone(data)});queue=work.catch(()=>{});return work}}
const config=readVtpassPhase0Config({POCKET_BILLS_TREASURY_ADDRESS:'0x1111111111111111111111111111111111111111'})
const store=createPocketBillsStore({config,storage,now:()=>time,uuid:()=>`00000000-0000-4000-8000-${String(++id).padStart(12,'0')}`})
const quote=(usd,extra={})=>store.createQuote({ownerId:'owner',idempotencyKey:`country:limit:fixture:${++id}`,serviceId:'mtn',serviceName:'MTN',phone:'08011111111',amountNgn:String(Number(usd)*1400),amountUsdc:usd,fxRateNgnPerUsdc:'1400',payerWallet:'0x2222222222222222222222222222222222222222',quoteExpiresAt:time+300000,...extra})
await assert.rejects(quote('50.000001',{amountNgn:'70000.01'}),e=>e.code==='BILLS_AMOUNT_ABOVE_LIMIT')
const first=await quote('50',{idempotencyKey:'country:limit:fixed-first',chargePlatformFee:true})
assert.equal((await store.readLimitUsage('owner')).airtime.usedTodayUsd,50,'Policy excludes separately quoted fees')
await quote('49',{idempotencyKey:'country:limit:fixed-first',amountNgn:'70000',fxRateNgnPerUsdc:'1428.57',chargePlatformFee:true})
assert.equal((await store.readLimitUsage('owner')).airtime.usedTodayUsd,50,'Quote refresh cannot rewrite the original reservation')
await quote('50',{serviceId:'ug-246',serviceName:'Uganda MTN',phone:'256700000000',variationCode:'3028',variationName:'Airtime',providerEmail:'fixture@example.com',international:{country:'UG',operatorId:'246',productTypeId:'1',deliveryCurrency:'UGX',deliveryAmount:'180000.00'}})
const race=await Promise.allSettled([quote('50'),quote('50')]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1)
assert.equal((await store.readLimitUsage('owner')).airtime.remainingTodayUsd,0,'Country switch does not reset budget')
const dataQuote=extra=>quote('400',{category:'data',serviceId:'mtn-data',serviceName:'MTN Data',variationCode:'fixture',variationName:'Data plan',...extra})
await dataQuote({});await assert.rejects(dataQuote({category:'tv',serviceId:'dstv',serviceName:'DSTV',phone:'1234567890',contactPhone:'08011111111',customerName:'Fixture'}),e=>e.code==='BILLS_DAILY_LIMIT_EXCEEDED')
assert.equal((await store.readLimitUsage('owner')).otherBills.remainingTodayUsd,350)
time+=86400000;assert.equal((await store.readLimitUsage('owner')).airtime.remainingTodayUsd,150)
const ng={country:'NG',category:'airtime',services:[{serviceId:'airtel',name:'Airtel',minimumAmount:50,maximumAmount:50000}],provider:{},ngnPerUsd:1400,remainingUsd:150,now:time}
assert.equal((await readBillCountryLimits(ng)).services[0].availableMaximum,50000,'Provider maximum must not round upwards')
assert.equal((await readBillCountryLimits({...ng,remainingUsd:10})).services[0].availableMaximum,14000)
assert.equal((await readBillCountryLimits({...ng,ngnPerUsd:900})).services[0].availableMaximum,45000,'Fresh FX changes effective ceiling')
const provider={listUgandaVariations:async()=>[{fixedPrice:false,minimum:50,maximum:519480,rate:0.385}]}
const ug=await readBillCountryLimits({...ng,country:'UG',services:[{serviceId:'ug-246',name:'Uganda MTN',minimumAmount:null,maximumAmount:null}],provider})
assert.equal(ug.currency,'UGX');assert.equal(ug.services[0].availableMaximum,181818.18,'UGX uses supplier conversion, not Nigerian face value')
const noBudget=await readBillCountryLimits({...ng,remainingUsd:0});assert.equal(noBudget.services[0].available,false)
await assert.rejects(readBillCountryLimits({...ng,ngnPerUsd:NaN}))
console.log('PASS USD caps, shared country ledger, exact quote valuation, fee separation, concurrency, shared other-bill budget, Lagos reset, provider ceilings, changing FX, Uganda supplier conversion and unavailable budget.')

