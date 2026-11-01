import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {finishInitialCircleWalletSetup} from '../src/lib/circleInitialWalletSetup.ts'
let created=0,reads=0
const deps={initialize:async()=>true,read:async()=>++reads<3?'empty':'ready',empty:s=>s==='empty',create:async()=>{created++},wait:async()=>{}}
assert.equal(await finishInitialCircleWalletSetup(deps),'ready');assert.equal(created,0)
await assert.rejects(finishInitialCircleWalletSetup({...deps,read:async()=>'empty'}),/still being prepared/);assert.equal(created,0)
await assert.rejects(finishInitialCircleWalletSetup({...deps,initialize:async()=>{throw Error('Cancelled')}}),/Cancelled/);assert.equal(created,0)
reads=0
assert.equal(await finishInitialCircleWalletSetup({...deps,initialize:async()=>false,read:async()=>++reads===1?'empty':'ready'}),'ready');assert.equal(created,1)
await finishInitialCircleWalletSetup({...deps,initialize:async()=>false,read:async()=>'ready'});assert.equal(created,1)
globalThis.initialWalletStore=new Map()
await build({entryPoints:['api/circle-solana-email.ts'],outfile:'.codex-temp/initial-wallet-handler-fixture.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'durable-fixture',setup(b){
 b.onResolve({filter:/render-durable-store\.js$/},a=>a.importer.replaceAll('\\','/').endsWith('/api/circle-solana-email.ts')?{path:a.path,namespace:'durable-fixture'}:undefined)
 b.onLoad({filter:/.*/,namespace:'durable-fixture'},()=>({contents:'export const hasRenderDurableStore=()=>true;export const readDurableJson=async k=>globalThis.initialWalletStore.get(k);export const writeDurableJson=async(k,v)=>{globalThis.initialWalletStore.set(k,v)};'}))
}}]})
process.env.CIRCLE_API_KEY='fixture-only'
const {default:handler}=await import('../.codex-temp/initial-wallet-handler-fixture.mjs')
let inventory=[],posts=[],denied=false
const originalFetch=globalThis.fetch
globalThis.fetch=async(url,options)=>{
 const path=new URL(url).pathname
 if(path==='/v1/w3s/user/initialize')return Response.json({data:{challengeId:'initialize-challenge'}})
 if(path==='/v1/w3s/wallets')return denied?Response.json({message:'Unauthorized'},{status:401}):Response.json({data:{wallets:inventory}})
 assert.equal(path,'/v1/w3s/user/wallets');assert.equal(options.method,'POST');posts.push(JSON.parse(options.body));return Response.json({data:{challengeId:'fixture-challenge'}})
}
async function call(token='session-a'){let status=200,result;await handler({method:'POST',headers:{},body:{action:'createUnifiedEvmWallets',userToken:token}},{setHeader(){},status(s){status=s;return this},json(v){result=v;return this}});return {status,result}}
try{
 for(const blockchain of ['BASE','ARB','ARC','ETH','MATIC']){
  inventory=[{id:'owned',blockchain}];assert.equal((await call()).status,409)
 }
 assert.equal(posts.length,0)
 inventory=[];denied=true;assert.equal((await call()).status,401);assert.equal(posts.length,0);denied=false
 assert.equal((await call()).status,200);assert.equal((await call()).status,200)
 assert.equal(posts[0].idempotencyKey,posts[1].idempotencyKey)
 await call('session-b');assert.notEqual(posts[0].idempotencyKey,posts[2].idempotencyKey)
 let initialized
 await handler({method:'POST',headers:{},body:{action:'initializeUnifiedEvmUser',userToken:'new-signup-session'}},{setHeader(){},status(){return this},json(v){initialized=v;return this}})
 assert.equal(initialized.challengeId,'initialize-challenge')
 const count=posts.length
 assert.equal((await call('new-signup-session')).status,409,'Persisted initialization blocks duplicate creation even while inventory is empty')
 assert.equal(posts.length,count)
 assert.ok([...initialWalletStore.keys()].every(k=>!k.includes('new-signup-session')))
}finally{globalThis.fetch=originalFetch}
console.log('PASS delayed initialization never creates twice; bounded retry, cancelled approval, existing wallet server guard, unauthorized inventory, same-session idempotency.')
