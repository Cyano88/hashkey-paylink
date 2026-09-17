import { readSolanaUsdcBalance } from '../api/solana-balance.ts'
import { solanaActivity } from '../api/pocket/wallet-chain-activity.ts'
import assert from 'node:assert/strict'
import { createSolanaReadFetch } from '../api/solana-read.ts'
const init = (method='getAccountInfo') => ({method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:[]})})
const success=()=>new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:null}))
let now=0,calls=[]
const read=createSolanaReadFetch(async url=>{calls.push(url);return url==='https://private.invalid'?new Response('sensitive',{status:429}):success()},()=>now,()=> 'https://private.invalid')
const warning=console.warn,logs=[];console.warn=(...args)=>logs.push(args)
try {
 await read('ignored',init());assert.deepEqual(calls,['https://private.invalid','https://api.mainnet-beta.solana.com'])
 await read('ignored',init());assert.equal(calls.length,3);assert.equal(calls[2],'https://api.mainnet-beta.solana.com')
 now=60001;await read('ignored',init());assert.equal(calls.length,5)
 assert(!JSON.stringify(logs).includes('sensitive'))
 const quotaJson=createSolanaReadFetch(async url=>url==='https://private.invalid'?new Response(JSON.stringify({error:{code:-32000,message:'compute units quota exhausted'}})):success(),Date.now,()=> 'https://private.invalid')
 await quotaJson('ignored',init())
 let invalid=0
 const config=createSolanaReadFetch(async()=>{invalid++;return new Response('secret',{status:403})},Date.now,()=> 'https://private.invalid')
 await assert.rejects(config('ignored',init()),e=>e.reason==='configuration');assert.equal(invalid,1)
 const method=createSolanaReadFetch(async()=>{throw Error('Must not reach upstream')})
 await assert.rejects(method('ignored',init('sendTransaction')),e=>e.reason==='scope')
 let quotaClock=0,total=0
 const quota=createSolanaReadFetch(async()=>{total++;return success()},()=>quotaClock,()=> 'https://private.invalid')
 const batch={method:'POST',body:JSON.stringify(Array.from({length:20},()=>JSON.parse(init().body)))}
 for(let i=0;i<6;i++)await quota('ignored',batch)
 await assert.rejects(quota('ignored',init()),e=>e.reason==='capacity');assert.equal(total,6)
 quotaClock=60000;await quota('ignored',init());assert.equal(total,7)
 let attempt=0,failClock=0
 const down=createSolanaReadFetch(async()=>{attempt++;return new Response('',{status:503})},()=>failClock,()=> 'https://private.invalid')
 await assert.rejects(down('ignored',init()));assert.equal(attempt,2)
 await assert.rejects(down('ignored',init()));assert.equal(attempt,2)
 failClock=15001;await assert.rejects(down('ignored',init()));assert.equal(attempt,3)
 const ctrl=new AbortController();let cancelled=0
 const cancel=createSolanaReadFetch(async(_url,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>{cancelled++;reject(Error('abort'))})),Date.now,()=> 'https://private.invalid')
 const pending=cancel('ignored',{...init(),signal:ctrl.signal});ctrl.abort();await assert.rejects(pending);assert.equal(cancelled,1)
 let releases=[]
 const bounded=createSolanaReadFetch(async()=>new Promise(r=>releases.push(()=>r(success()))))
 const jobs=Array.from({length:8},()=>bounded('ignored',init()))
 await assert.rejects(bounded('ignored',init()),e=>e.reason==='capacity');releases.forEach(r=>r());await Promise.all(jobs)
 const huge=createSolanaReadFetch(async()=>new Response('x'.repeat(2097153)))
 await assert.rejects(huge('ignored',init()),e=>e.reason==='rpc')
} finally { console.warn=warning }
let sdkCalls = 0
const sdkTransport = createSolanaReadFetch(async (url, options) => {
 sdkCalls++
 if (url === 'https://private.invalid') return new Response('', { status: 429 })
 const request = JSON.parse(options.body)
 assert.equal(request.method, 'getSignaturesForAddress')
 return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: [] }))
}, Date.now, () => 'https://private.invalid')
const sdkRows = await solanaActivity('11111111111111111111111111111111', new AbortController().signal, sdkTransport)
assert.deepEqual(sdkRows, []); assert.equal(sdkCalls, 2, 'empty history avoids a transaction batch and SDK retries')
const balanceMethods = []
const balanceTransport = createSolanaReadFetch(async (_url, options) => {
 const request = JSON.parse(options.body); balanceMethods.push(request.method)
 const value = request.method === 'getAccountInfo'
   ? { executable: false, owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', lamports: 1, data: ['', 'base64'], rentEpoch: 0 }
   : { amount: '9007199254740993', decimals: 6, uiAmount: null, uiAmountString: '9007199254.740993' }
 return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { context: { slot: 1 }, value } }))
})
const balance = await readSolanaUsdcBalance('11111111111111111111111111111111', balanceTransport)
assert.equal(balance.balance, 9007199254740993n)
assert.deepEqual(balanceMethods, ['getAccountInfo', 'getTokenAccountBalance'])
console.log('Solana shared reads: quota fallback, cooldown, abort, batch budget, concurrency, scope, configuration failure and response bounds passed')
