import assert from 'node:assert/strict'
import {createReadService,validateRead} from '../api/evm-read.ts'
const tx=n=>'0x'+n.toString(16).padStart(64,'0')
const trace=[tx(1),{tracer:'callTracer'}]
const networks=[['base','PRIVATE_RPC_URL','0x2105'],['arbitrum','PRIVATE_RPC_URL_ARB','0xa4b1'],['arc','PRIVATE_RPC_URL_ARC_MAINNET','0x13b2'],['ethereum','PRIVATE_RPC_URL_ETHEREUM','0x1'],['polygon','PRIVATE_RPC_URL_POLYGON','0x89']]
const saved=Object.fromEntries(networks.map(([,key])=>[key,process.env[key]]))
try{
 for(const [network,key,id] of networks){
  process.env[key]='https://'+network+'.fixture.invalid/secret'
  const calls=[]
  const read=createReadService(async(url,init)=>{const body=JSON.parse(init.body);calls.push({url,method:body.method});return Response.json({result:body.method==='eth_chainId'?id:{value:calls.length}})},()=>1,{bridgeProof:true})
  await read(network,'eth_chainId',[]);await read(network,'eth_chainId',[])
  await read(network,'eth_getTransactionReceipt',[tx(1)]);await read(network,'eth_getTransactionReceipt',[tx(1)])
  await read(network,'eth_getBlockByNumber',['finalized',false]);await read(network,'eth_getBlockByNumber',['finalized',false])
  await read(network,'debug_traceTransaction',trace)
  assert.equal(calls.length,7,'proof rereads must reach RPC, without display cache or redundant identity reads')
  assert.ok(calls.every(c=>c.url===process.env[key]),'reuse established endpoint variable for '+network)
 }
 assert.throws(()=>validateRead('debug_traceTransaction',trace),e=>e.code===-32601)
 let invalidCalls=0
 const restricted=createReadService(async()=>{invalidCalls++;assert.fail('invalid scope reached RPC')},()=>1,{bridgeProof:true})
 for(const [method,params] of [['debug_traceCall',[]],['eth_sendRawTransaction',['0x']],['eth_getLogs',[]],['eth_getBlockByNumber',['latest',false]],['eth_getBlockByNumber',['finalized',true]],['debug_traceTransaction',[tx(1),{tracer:'custom'}]],['debug_traceTransaction',[tx(1),{tracer:'callTracer',timeout:'100s'}]]])await assert.rejects(()=>restricted('base',method,params))
 assert.equal(invalidCalls,0)

 let clock=1,calls=0
 const limited=createReadService(async(_url,init)=>{const b=JSON.parse(init.body);if(b.method==='debug_traceTransaction')calls++;return Response.json({result:b.method==='eth_chainId'?'0x2105':{type:'CALL'}})},()=>clock,{bridgeProof:true})
 for(let n=0;n<6;n++)await limited('base','debug_traceTransaction',[tx(n+1),{tracer:'callTracer'}])
 await assert.rejects(()=>limited('base','debug_traceTransaction',[tx(7),{tracer:'callTracer'}]),e=>e.code===-32005)
 assert.equal(calls,6);clock+=60000;await limited('base','debug_traceTransaction',trace);assert.equal(calls,7)

 let release,activeCalls=0
 const gate=new Promise(r=>{release=r})
 const concurrent=createReadService(async(_url,init)=>{const b=JSON.parse(init.body);if(b.method==='debug_traceTransaction'){activeCalls++;await gate}return Response.json({result:b.method==='eth_chainId'?'0x2105':{type:'CALL'}})},()=>1,{bridgeProof:true})
 const shared=Array.from({length:10},()=>concurrent('base','debug_traceTransaction',trace))
 const second=concurrent('base','debug_traceTransaction',[tx(2),{tracer:'callTracer'}])
 await assert.rejects(()=>concurrent('base','debug_traceTransaction',[tx(3),{tracer:'callTracer'}]),e=>e.code===-32005)
 release();await Promise.all([...shared,second]);assert.equal(activeCalls,2,'identical in-flight traces share work, with two trace jobs maximum')

 clock=1;let upstream=0,traces=0
 const fallback=createReadService(async(url,init)=>{
  upstream++;const b=JSON.parse(init.body)
  if(b.method==='eth_chainId')return Response.json({result:'0x2105'})
  traces++
  return url.includes('fixture.invalid')?new Response('',{status:429}):Response.json({error:{code:-32611,message:'private secret URL must not escape'}})
 },()=>clock,{bridgeProof:true})
 await assert.rejects(()=>fallback('base','debug_traceTransaction',trace),e=>e.code===-32611&&!e.message.includes('secret'))
 const after=upstream
 await assert.rejects(()=>fallback('base','debug_traceTransaction',[tx(2),{tracer:'callTracer'}]),e=>e.code===-32004)
 assert.equal(upstream,after,'unsupported fallback trace is cooled down without another billable request');assert.equal(traces,2)
 clock+=60000;await assert.rejects(()=>fallback('base','debug_traceTransaction',trace));assert.equal(traces,4)
 let fallbackAttempts=0
 const boundedFallback=createReadService(async(url,init)=>{const b=JSON.parse(init.body);if(b.method==='eth_chainId')return Response.json({result:'0x2105'});fallbackAttempts++;return url.includes('fixture.invalid')?new Response('',{status:429}):Response.json({result:{type:'CALL'}})},()=>1,{bridgeProof:true})
 for(let n=1;n<=5;n++)await boundedFallback('base','debug_traceTransaction',[tx(n),{tracer:'callTracer'}])
 assert.equal(fallbackAttempts,6,'failed primary and fallback both consume the trace budget')
 await assert.rejects(()=>boundedFallback('base','debug_traceTransaction',[tx(6),{tracer:'callTracer'}]),e=>e.code===-32005)
 assert.equal(fallbackAttempts,6)
 const cancelled=new AbortController();cancelled.abort()
 await assert.rejects(()=>boundedFallback('base','debug_traceTransaction',trace,cancelled.signal),e=>e.name==='AbortError')
 assert.equal(fallbackAttempts,6,'cancelled probes must not spend RPC budget')

 let chain='0x2105'
 const changing=createReadService(async()=>Response.json({result:chain}),()=>1,{bridgeProof:true})
 await changing('base','eth_chainId',[]);chain='0x1'
 await assert.rejects(()=>changing('base','eth_chainId',[]),e=>e.code===-32003,'fresh chain check cannot use a configured constant')
 const oversized=createReadService(async(_url,init)=>Response.json({result:JSON.parse(init.body).method==='eth_chainId'?'0x2105':'x'.repeat(1048577)}),()=>1,{bridgeProof:true,publicOnly:true})
 await assert.rejects(()=>oversized('base','debug_traceTransaction',trace),e=>e.code===-32004)
 let requests=0
 const capacity=createReadService(async()=>{requests++;return Response.json({result:'0x2105'})},()=>1,{bridgeProof:true})
 for(let n=0;n<300;n++)await capacity('base','eth_chainId',[])
 await assert.rejects(()=>capacity('base','eth_chainId',[]),e=>e.code===-32005);assert.equal(requests,300)
 console.log('PASS bridge proof RPC cost controls: five existing endpoint aliases, fresh proof/chain reads, public trace rejection, single-flight, two concurrent/six-per-minute traces, fallback capability cooldown, 1 MiB response and 300-attempt limits. Fixtures only.')
}finally{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
