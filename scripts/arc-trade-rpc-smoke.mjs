import assert from 'node:assert/strict'
import {arcTradeClient} from '../api/trade-agreement/arc-client.ts'
const originalFetch=globalThis.fetch
const calls=[]
let mode='throttled'
globalThis.fetch=async(input,init)=>{
  const request=input instanceof Request?input:new Request(input,init)
  const body=await request.json(),host=new URL(request.url).hostname
  calls.push(host)
  const error=mode==='revert'?{code:3,message:'execution reverted'}:mode==='down'||host!=='rpc.drpc.mainnet.arc.io'?{code:-32005,message:'rate limit exceeded'}:undefined
  return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,...(error?{error}:{result:'0x13b2'})}),{headers:{'content-type':'application/json'}})
}
try{
  assert.equal(await arcTradeClient({PRIVATE_RPC_URL_ARC_MAINNET:'https://private.example'}).getChainId(),5042)
  assert.deepEqual(calls,['private.example','rpc.mainnet.arc.io','rpc.drpc.mainnet.arc.io'])
  calls.length=0
  assert.equal(await arcTradeClient({}).getChainId(),5042)
  assert.deepEqual(calls,['rpc.mainnet.arc.io','rpc.drpc.mainnet.arc.io'])
  mode='down'
  await assert.rejects(arcTradeClient({}).getChainId(),/limit/i)
  mode='revert';calls.length=0
  await assert.rejects(arcTradeClient({}).call({to:'0x1111111111111111111111111111111111111111',data:'0x12345678'}),/revert/i)
  assert.ok(calls.every(host=>host==='rpc.mainnet.arc.io'),'Contract reverts must not be retried against another provider')
  assert.throws(()=>arcTradeClient({PRIVATE_RPC_URL_ARC_MAINNET:'http://unsafe.example'}),/Invalid Arc RPC/)
  console.log('Arc Trade RPC fallback: throttling recovery, endpoint deduplication, total outage and revert safety passed')
}finally{globalThis.fetch=originalFetch}
