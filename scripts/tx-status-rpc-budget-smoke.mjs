import assert from 'node:assert/strict'
import handler from '../api/tx-status.ts'
const originalFetch=globalThis.fetch
let calls=[]
globalThis.fetch=async (url, options) => {
  calls.push({url,body:JSON.parse(options.body)})
  await new Promise(resolve=>setTimeout(resolve,10))
  return new Response(JSON.stringify({result:{blockNumber:'0x12'}}),{status:200,headers:{'content-type':'application/json'}})
}
async function request(body,method='POST') {
 const res={code:200,body:null,status(code){this.code=code;return this},json(body){this.body=body;return this}}
 await handler({method,body},res)
 return res
}
try {
 for(const hash of ['0x1','0x'+'f'.repeat(65),{},['0x'+'a'.repeat(64)],null]) assert.equal((await request({hash})).code,400)
 assert.equal((await request({hash:'0x'+'1'.repeat(64),network:'unknown'})).code,400)
 assert.equal((await request({},'GET')).code,405)
 assert.equal(calls.length,0,'Invalid input must not spend RPC requests')
 const hash='0x'+'a'.repeat(64)
 const results=await Promise.all(Array.from({length:12},()=>request({hash,network:'arc'})))
 assert.equal(calls.length,1,'Concurrent identical requests should share one RPC call')
 assert.ok(results.every(r=>r.body.found && r.body.network==='Arc'))
 await request({hash:hash.toUpperCase().replace('0X','0x'),network:'arc'})
 assert.equal(calls.length,1,'Equivalent hashes reuse the short cache')
 await request({hash,network:'base'})
 assert.equal(calls.length,2,'A different network must not reuse an Arc result')
 await request({hash:'0x'+'b'.repeat(64)})
 assert.equal(calls.length,5,'Legacy callers without a network still probe supported networks')
 globalThis.fetch=async()=>{calls.push({});throw Error('provider down')}
 const missing='0x'+'c'.repeat(64)
 assert.equal((await request({hash:missing,network:'arc'})).body.found,false)
 await request({hash:missing,network:'arc'})
 assert.equal(calls.length,7,'Upstream failures must remain retryable')
 console.log('RPC lookup input validation, concurrency, network isolation, legacy behavior and failure retry passed.')
} finally {globalThis.fetch=originalFetch}
