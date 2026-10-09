import assert from 'node:assert/strict'
import {createPocketFxQuoteReader,createPocketFxQuoteHandler} from '../api/pocket/fx-quote.ts'
import {readPocketFxQuote} from '../src/pocket/api/pocketFxClient.ts'
import {runtimePublicConfig} from '../api/runtime-public-config.ts'
const now=Date.now()
const usdc={currency:'NGN',symbol:'₦',amount:'1',rate:1500,source:'paycrest',side:'sell',quotedAt:now,expiresAt:now+60000}
let saved,urls=[]
const reader=createPocketFxQuoteReader({asset:'USDT',now:()=>now,readLastKnown:async()=>usdc,writeLastKnown:async q=>{saved=q},fetcher:async url=>{urls.push(String(url));return new Response(JSON.stringify({status:'success',data:{sell:{rate:1400}}}))}})
const quote=await reader('1')
assert.equal(quote.asset,'USDT');assert.equal(quote.rate,1400)
assert.match(urls[0],/\/base\/USDT\/1\/NGN/)
assert.equal(saved.asset,'USDT')
await reader('1');assert.equal(urls.length,1)
const failed=createPocketFxQuoteReader({asset:'USDT',now:()=>now,readLastKnown:async()=>usdc,writeLastKnown:async()=>{},fetcher:async()=>new Response(JSON.stringify({status:'error',message:'No provider available'}),{status:404})})
await assert.rejects(failed('1'),/No provider/)
let requestUrl
assert.equal((await readPocketFxQuote('1',async url=>{requestUrl=String(url);return new Response(JSON.stringify({ok:true,quote}))},'NGN','USDT')).asset,'USDT')
assert.match(requestUrl,/asset=USDT/)
await assert.rejects(readPocketFxQuote('1',async()=>new Response(JSON.stringify({ok:true,quote:usdc})),'NGN','USDT'),/did not match/)
assert.equal((await readPocketFxQuote('1',async()=>new Response(JSON.stringify({ok:true,quote:usdc})))).rate,1500)
async function call(query,readQuote){const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};await createPocketFxQuoteHandler({readQuote})({method:'GET',query},res);return res}
assert.equal((await call({asset:'BAD'},async()=>quote)).statusCode,400)
assert.equal((await call({asset:'USDT'},async()=>usdc)).statusCode,503)
assert.equal((await call({asset:'USDT'},async(_amount,_currency,asset)=>{assert.equal(asset,'USDT');return quote})).statusCode,200)
for(const env of [{},{POCKET_USDT_PAYOUT_ENABLED:'true'},{VITE_POCKET_USDT_PAYOUT:'true'}])assert.equal(runtimePublicConfig(env).payouts.usdtEnabled,false)
assert.equal(runtimePublicConfig({POCKET_USDT_PAYOUT_ENABLED:'true',VITE_POCKET_USDT_PAYOUT:'true'}).payouts.usdtEnabled,true)
console.log('PASS USDT bank estimate request/response binding, separate cache, no USDC fallback, provider failure and matching public rollout flags.')
