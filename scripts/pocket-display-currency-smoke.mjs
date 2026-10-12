import assert from 'node:assert/strict'
import { createPocketFxQuoteReader, createPocketFxQuoteHandler } from '../api/pocket/fx-quote.ts'
import { readPocketFxQuote, parsePocketFxQuote } from '../src/pocket/api/pocketFxClient.ts'
import { normalizePocketDisplayCurrency, localCurrencyAmount } from '../src/pocket/lib/pocketDisplayCurrency.ts'
import { isPocketProfileUpsertRequest } from '../src/pocket/lib/pocketSchemas.ts'
import { parsePocketLocalCurrencyProfileRead } from '../src/pocket/api/pocketReadClient.ts'
import { paymentReceiptView } from '../src/lib/paymentReceiptPdf.ts'
let now = 1800000000000, calls = []
const base = { now: () => now, readLastKnown: async () => undefined, writeLastKnown: async () => {}, fetcher: async url => { calls.push(String(url)); await new Promise(r => setTimeout(r, 5)); return new Response(JSON.stringify({ status: 'success', data: { sell: { rate: String(url).includes('/UGX?') ? '3700' : '1400' } } })) } }
const readers = { NGN: createPocketFxQuoteReader(base), UGX: createPocketFxQuoteReader({ ...base, currency: 'UGX' }) }
const results = await Promise.all([readers.NGN(), readers.UGX(), readers.UGX()])
assert.equal(calls.length, 2, 'Deduplicate concurrent quotes separately per currency')
assert.equal(results[0].rate, 1400); assert.equal(results[1].rate, 3700)
assert.equal(results[1].currency, 'UGX'); assert.equal(results[1].symbol, 'UGX')
await readers.UGX(); assert.equal(calls.length, 2, 'Reuse fresh quotes')
now += 30001; await readers.UGX(); assert.equal(calls.length, 3)
let requested = ''
await readPocketFxQuote('1', async url => { requested = String(url); return new Response(JSON.stringify({ok:true,quote:results[1]})) }, 'UGX')
assert.match(requested, /currency=UGX/)
await assert.rejects(readPocketFxQuote('1', async () => new Response(JSON.stringify({ok:true,quote:results[0]})), 'UGX'), /did not match/)
assert.throws(() => parsePocketFxQuote({ok:true,quote:{...results[1],symbol:'NGN'}}), /invalid/)
const wrongSaved = createPocketFxQuoteReader({...base,currency:'UGX', readLastKnown:async()=>results[0]})
assert.equal((await wrongSaved()).currency,'UGX', 'Never reuse a stored NGN quote as UGX')
const handler=createPocketFxQuoteHandler({readQuote:(amount,currency)=>readers[currency](amount)})
const response=()=>({statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}})
for(const currency of ['NGN','UGX']) {const r=response();await handler({method:'GET',query:{currency}},r);assert.equal(r.statusCode,200);assert.equal(r.body.quote.currency,currency)}
const rejected=response();await handler({method:'GET',query:{currency:'GHS'}},rejected);assert.equal(rejected.statusCode,400)
for(const currency of ['USDC','NGN','UGX'])assert.equal(isPocketProfileUpsertRequest({pocketId:'12345678',displayCurrency:currency}),true)
for(const currency of ['GHS','KES','USD']) {assert.equal(normalizePocketDisplayCurrency(currency),'USDC');assert.equal(isPocketProfileUpsertRequest({pocketId:'12345678',displayCurrency:currency}),false)}
const profile={firstName:'',lastName:'',resolvedName:'',nameStatus:'unverified',email:'fixture@example.com',pocketNumber:'12345678',pocketId:'12345678',avatarId:1}
assert.equal(parsePocketLocalCurrencyProfileRead({ok:true,profile:{...profile,displayCurrency:'GHS'}}).profile.displayCurrency,'USDC')
assert.equal(parsePocketLocalCurrencyProfileRead({ok:true,profile:{...profile,displayCurrency:'UGX'}}).profile.displayCurrency,'UGX')
assert.equal(localCurrencyAmount(3700,'UGX'),'3,700.00 UGX')
const receipt={type:'test',receiptId:'fixture',receiptHash:'',title:'Bank transfer',status:'confirmed',eventId:'fixture',txHash:'',chain:'base',payer:'',memo:'',amount:'1.25',asset:'USDC',createdAt:0,source:'bank-withdraw',amountNgn:'1700',fiatCurrency:'NGN',brandKind:'pocket'}
const view=paymentReceiptView(receipt)
assert.equal(view.amount,'1,700.00 NGN')
assert.ok(view.rows.some(row=>row.label==='Paid with'&&row.value==='1.25 USDC'), 'Keep recorded delivery amount on receipt')
assert.equal(paymentReceiptView({...receipt,asset:'NVDAx',amountNgn:undefined,source:'xstocks'}).amount,'1.25 NVDAx')
console.log('PASS: isolated Paycrest currencies, quote deduplication, strict response matching, legacy preference migration, recorded-currency receipts and recorded local amounts.')

// A slow durable store cannot hold a fresh quote response hostage.
let finishRead, finishWrite
const noStorageDelay = createPocketFxQuoteReader({...base,
 readLastKnown:()=>new Promise(resolve=>finishRead=resolve),
 writeLastKnown:()=>new Promise(resolve=>finishWrite=resolve),
})
const fresh = await Promise.race([noStorageDelay(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Storage delayed FX response')),500))])
assert.equal(fresh.rate,1400)
finishRead({...fresh,rate:1,quotedAt:fresh.quotedAt-10000});finishWrite()
await new Promise(resolve=>setImmediate(resolve))
assert.equal((await noStorageDelay()).rate,1400,'late saved rate never overwrites newer live quote')
console.log('PASS live quote delivery independent of durable read/write latency.')

const {readPocketDisplayCurrency,savePocketDisplayCurrency,publishPocketDisplayCurrency,subscribePocketDisplayCurrency,formatPocketFiatAmount}=await import('../src/pocket/lib/pocketDisplayCurrency.ts')
const values=new Map();globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}
values.set('pocket.xstocks.displayCurrency:fixture@example.com','UGX')
assert.equal(readPocketDisplayCurrency(' Fixture@example.com '),'UGX','Preserve legacy stock preference if no explicit stablecoin choice')
let updates=0;const unsubscribe=subscribePocketDisplayCurrency(()=>updates++)
savePocketDisplayCurrency('fixture@example.com','NGN')
assert.equal(readPocketDisplayCurrency('fixture@example.com'),'NGN')
publishPocketDisplayCurrency('fixture@example.com','USDC')
assert.equal(readPocketDisplayCurrency('fixture@example.com'),'NGN','Server default cannot override explicit choice')
assert.equal(readPocketDisplayCurrency('other@example.com'),'USDC','Account preferences stay isolated')
assert.equal(updates,2);unsubscribe()
for(const currency of ['USDC','NGN','UGX']){savePocketDisplayCurrency('fixture@example.com',currency);assert.equal(paymentReceiptView(receipt).amount,'1,700.00 NGN')}
assert.equal(formatPocketFiatAmount(12.0445,'USD'),'12.04 USD')
console.log('PASS shared preference, legacy fallback, account isolation, notifications, fiat code formatting and immutable receipt currency.')
