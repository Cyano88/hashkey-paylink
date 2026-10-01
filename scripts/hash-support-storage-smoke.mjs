import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
let local,remoteValue=null,revision=0,fail=false,dropAck=false,calls=0
const originalFetch=globalThis.fetch
process.env.HASH_SUPPORT_URL='https://hash.fixture.test';process.env.HASH_SUPPORT_API_KEY='fixture-server-key'
globalThis.fetch=async(_url,options)=>{
 calls++;assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer fixture-server-key')
 if(fail)throw Error('Connection lost')
 if(options.method==='PUT'){
  const data=JSON.parse(options.body)
  if(data.revision!==revision)return Response.json({ok:false},{status:409})
  remoteValue=structuredClone(data.value);revision++
  if(dropAck){dropAck=false;throw Error('Acknowledgement lost')}
  return Response.json({ok:true,revision,workspaceId:'fixture-workspace'})
 }
 return Response.json({ok:true,revision,value:remoteValue,workspaceId:'fixture-workspace'})
}
let chain=Promise.resolve()
globalThis.hashRead=async()=>structuredClone(local)
globalThis.hashMutate=async(_key,fn)=>{const operation=chain.then(async()=>{const next=await fn(structuredClone(local));local=structuredClone(next);return next});chain=operation.catch(()=>{});return operation}
const bundled=await build({entryPoints:['api/hash-support/pocket-storage.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'durable-fixture',setup(b){b.onResolve({filter:/render-durable-store\.js$/},()=>({path:'store',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const readDurableJson=(...args)=>globalThis.hashRead(...args);export const mutateDurableJson=(...args)=>globalThis.hashMutate(...args);'}))}}]})
const module={exports:{}};new Function('require','module','exports',bundled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports)
const {readSupportJson:read,mutateSupportJson:mutate,migrateSupportStorage:migrate}=module.exports
try{
 local={cases:{a:{messages:['original']}},knowledge:{approved:'answer'},staffNames:{one:'Support'}}
 assert.deepEqual(await read('support'),local);assert.equal(calls,0)
 // Remote write succeeded but reply was lost: local history remains authoritative until verified retry.
 dropAck=true;await assert.rejects(migrate('support'),e=>e.status===503)
 assert.equal(local.__hashSupportRemote,undefined);assert.equal(revision,1)
 await migrate('support');assert.equal(local.__hashSupportRemote,true)
 assert.deepEqual(await read('support'),remoteValue)
 await Promise.all([mutate('support',v=>{v.cases.a.messages.push('first');return v}),mutate('support',v=>{v.cases.a.messages.push('second');return v})])
 assert.deepEqual((await read('support')).cases.a.messages,['original','first','second'])
 fail=true;await assert.rejects(read('support'),e=>e.status===503);await assert.rejects(mutate('support',v=>v),e=>e.status===503)
 assert.equal(local.__hashSupportRemote,true);fail=false
 await migrate('support',true);assert.equal(local.__hashSupportRemote,undefined)
 assert.deepEqual(local.cases.a.messages,['original','first','second']);assert.deepEqual(local.knowledge,{approved:'answer'})
 local={cases:{other:{messages:[]}}};await assert.rejects(migrate('support'),e=>e.status===409)
 console.log('PASS adapter: migration verification, lost acknowledgement recovery, serialized writes, preserved knowledge/staff data, no stale fallback, current-data rollback, conflicting dataset rejection')
}finally{globalThis.fetch=originalFetch}
