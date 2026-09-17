import assert from 'node:assert/strict'
import { validateRead, createReadService, ReadRpcError } from '../api/evm-read.ts'
const wallet = '0x' + '12'.repeat(20)
const topic = '0x' + '34'.repeat(32)
for (const method of ['eth_sendRawTransaction', 'eth_sendTransaction', 'eth_sign', 'debug_traceCall', 'eth_newFilter']) {
 assert.throws(() => validateRead(method, []), e => e.code === -32601)
}
for (const params of [
 [{to:wallet,data:'0x',gas:'0xffffff'},'latest'],
 [{to:wallet,data:'0x'},'latest',{}],
 [{to:wallet,data:'0x',authorizationList:[]},'latest'],
 [{to:wallet,data:'0x',value:'0x1'},'latest'],
]) assert.throws(() => validateRead('eth_call',params))
assert.equal(validateRead('eth_call',[{to:wallet,data:'0x'},'latest']).params[0].gas,'0xf4240')
validateRead('eth_getBlockByNumber',['latest',true])
assert.throws(() => validateRead('eth_getBlockByNumber',['latest','true']))
assert.throws(() => validateRead('eth_getLogs',[{address:wallet,topics:[topic],fromBlock:'0x0',toBlock:'0x1'}]))
assert.throws(() => validateRead('eth_getLogs',[{address:wallet,topics:[topic,topic],fromBlock:'0x0',toBlock:'0x800'}]))
validateRead('eth_getLogs',[{address:wallet,topics:[topic,null,topic],fromBlock:'0x0',toBlock:'0x7ff'}])
let count=0, clock=0
const exact='0x' + (2n ** 100n).toString(16).padStart(64,'0')
const reader=createReadService(async()=>{count++;await new Promise(r=>setTimeout(r,5));return Response.json({result:exact})},()=>clock)
const params=[{to:wallet,data:'0x70a08231'+wallet.slice(2).padStart(64,'0')},'latest']
const [a,b]=await Promise.all([reader('arc','eth_call',params),reader('arc','eth_call',params)])
assert.equal(a,exact); assert.equal(b,exact);assert.equal(count,1)
await reader('arc','eth_call',params); assert.equal(count,1)
clock=3001;await reader('arc','eth_call',params);assert.equal(count,2)
const old=process.env.PRIVATE_RPC_URL
process.env.PRIVATE_RPC_URL='https://private.invalid/secret-not-for-output'
try {
 let calls=[]
 const fallback=createReadService(async(url)=>{calls.push(url);return url.includes('private.invalid')?new Response('',{status:429}):Response.json({result:'0x1'})},()=>clock)
 assert.equal(await fallback('base','eth_blockNumber',[]),'0x1')
 assert.equal(calls.length,2)
 clock+=3001;await fallback('base','eth_blockNumber',[])
 assert.equal(calls.length,3);assert.equal(calls[2],'https://mainnet.base.org')
 let failed=0
 const noFallback=createReadService(async()=>{failed++;return Response.json({error:{code:3,message:'execution reverted secret'}})})
 await assert.rejects(()=>noFallback('base','eth_call',params),e=>e instanceof ReadRpcError && !e.message.includes('secret'))
 assert.equal(failed,1)
} finally {if(old===undefined)delete process.env.PRIVATE_RPC_URL;else process.env.PRIVATE_RPC_URL=old}
let inflight=0, release
const gate=new Promise(r=>release=r)
const busy=createReadService(async()=>{inflight++;await gate;return Response.json({result:'0x1'})})
const work=Array.from({length:16},(_,i)=>busy('arc','eth_getTransactionReceipt',['0x'+i.toString(16).padStart(64,'0')]))
await assert.rejects(()=>busy('arc','eth_getTransactionReceipt',['0x'+'ff'.repeat(32)]),e=>e.code===-32005)
release();await Promise.all(work);assert.equal(inflight,16)
console.log('EVM read scope, exact units, cache, deduplication, cooldown, sanitized errors and concurrency: passed')
