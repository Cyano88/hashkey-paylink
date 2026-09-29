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
assert.match(localCurrencyAmount(3700,'UGX'),/^UGX /)
const receipt={type:'test',receiptId:'fixture',receiptHash:'',title:'Bank transfer',status:'confirmed',eventId:'fixture',txHash:'',chain:'base',payer:'',memo:'',amount:'1.25',asset:'USDC',createdAt:0,source:'bank-withdraw',amountNgn:'1700',fiatCurrency:'NGN',brandKind:'pocket'}
const view=paymentReceiptView(receipt)
assert.equal(view.amount,'1.25 USDC')
assert.ok(view.rows.some(row=>row.label==='Local amount'&&row.value.includes('1,700')), 'Keep recorded delivery amount on receipt')
assert.equal(paymentReceiptView({...receipt,asset:'NVDAx',amountNgn:undefined,source:'xstocks'}).amount,'1.25 NVDAx')
console.log('PASS: isolated Paycrest currencies, quote deduplication, strict response matching, legacy preference migration, USDC-first receipts and recorded local amounts.')
