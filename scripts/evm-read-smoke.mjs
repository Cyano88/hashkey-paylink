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

const priorPrivate=process.env.PRIVATE_RPC_URL
try {
 process.env.PRIVATE_RPC_URL='https://private.invalid/must-not-be-used'
 const destinations=[]
 const publicOnly=createReadService(async url=>{destinations.push(url);return Response.json({result:{number:'0x1'}})},Date.now,{publicOnly:true})
 await publicOnly('base','eth_getBlockByNumber',['finalized',false])
 assert.deepEqual(destinations,['https://mainnet.base.org'])
 await assert.rejects(publicOnly('base','eth_sendRawTransaction',['0x']),error=>error.code===-32601)
} finally {if(priorPrivate===undefined)delete process.env.PRIVATE_RPC_URL;else process.env.PRIVATE_RPC_URL=priorPrivate}
console.log('PASS: independent public reader uses pinned network endpoint and retains read-only method restrictions.')

const originalPrivate=process.env.PRIVATE_RPC_URL
try {
 let requests=0
 const strict=createReadService(async()=>{requests++;return new Response('',{status:429})},Date.now,{privateOnly:true})
 delete process.env.PRIVATE_RPC_URL
 await assert.rejects(strict('base','eth_blockNumber',[]),e=>e.code===-32003)
 process.env.PRIVATE_RPC_URL='https://mainnet.base.org/alternate-path'
 await assert.rejects(strict('base','eth_blockNumber',[]),e=>e.code===-32003)
 assert.equal(requests,0)
 process.env.PRIVATE_RPC_URL='https://private.invalid/secret'
 await assert.rejects(strict('base','eth_blockNumber',[]),e=>e.code===-32004)
 assert.equal(requests,1,'private outage must not silently use public RPC')
 const destinations=[]
 const healthy=createReadService(async url=>{destinations.push(url);return Response.json({result:'0x1'})},Date.now,{privateOnly:true})
 assert.equal(await healthy('base','eth_blockNumber',[]),'0x1')
 assert.deepEqual(destinations,['https://private.invalid/secret'])
} finally {if(originalPrivate===undefined)delete process.env.PRIVATE_RPC_URL;else process.env.PRIVATE_RPC_URL=originalPrivate}
console.log('PASS: strict private reader requires a distinct configured host and never falls back to public.')

for (const [network,chainId] of [['ethereum','0x1'],['polygon','0x89']]) {
 const methods=[];
 const checked=createReadService(async (_url,init)=>{const {method}=JSON.parse(init.body);methods.push(method);return Response.json({result:method==='eth_chainId'?chainId:'0x123'})});
 assert.equal(await checked(network,'eth_blockNumber',[]),'0x123');
 assert.equal(await checked(network,'eth_getBalance',[wallet,'latest']),'0x123');
 assert.equal(methods.filter(method=>method==='eth_chainId').length,1);
 let calls=0;
 const wrong=createReadService(async()=>{calls++;return Response.json({result:'0x2105'})});
 await assert.rejects(wrong(network,'eth_blockNumber',[]),error=>error.code===-32003);
 assert.equal(calls,1,'wrong-network endpoint must fail closed before reading balances');
}
console.log('PASS: Ethereum and Polygon verified chain identity and fail-closed reads.');

const savedEth=process.env.PRIVATE_RPC_URL_ETHEREUM,savedPol=process.env.PRIVATE_RPC_URL_POLYGON;
try {
 process.env.PRIVATE_RPC_URL_ETHEREUM=process.env.PRIVATE_RPC_URL_POLYGON='https://same-network-fixture.invalid';
 const shared=createReadService(async(_url,init)=>Response.json({result:JSON.parse(init.body).method==='eth_chainId'?'0x1':'0x123'}),()=>0);
 assert.equal(await shared('ethereum','eth_blockNumber',[]),'0x123');
 await assert.rejects(shared('polygon','eth_blockNumber',[]),e=>e.code===-32003);
} finally {
 if(savedEth===undefined)delete process.env.PRIVATE_RPC_URL_ETHEREUM;else process.env.PRIVATE_RPC_URL_ETHEREUM=savedEth;
 if(savedPol===undefined)delete process.env.PRIVATE_RPC_URL_POLYGON;else process.env.PRIVATE_RPC_URL_POLYGON=savedPol;
}
console.log('PASS: sharing an RPC URL cannot reuse Ethereum verification for Polygon, including at clock zero.');
