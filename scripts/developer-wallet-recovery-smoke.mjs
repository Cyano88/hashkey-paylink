import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {developerAdditionalWallet} from '../api/pocket/developer-wallet-recovery.ts'
const address='0x1111111111111111111111111111111111111111',oldAddress='0x2222222222222222222222222222222222222222'
const anchor={id:'base',blockchain:'BASE',address,accountType:'SCA',state:'LIVE',scaCore:'circle_6900_singleowner_v4'}
const original={...anchor,id:'original',blockchain:'ETH',address:oldAddress}
const candidate={...anchor,id:'candidate',blockchain:'ETH',refId:'pocket:evm-candidate:v2:additional:base'}
for(const [network,blockchain] of [['ethereum','ETH'],['polygon','MATIC']]){
 const old={...original,blockchain},next={...candidate,blockchain}
 assert.equal(developerAdditionalWallet([anchor,old,next],network).id,'original')
 assert.equal(developerAdditionalWallet([anchor,next],network),undefined)
 for(const invalid of [[old,{...old,id:'duplicate'}],[old,old],[{...old,state:'FROZEN'}],[{...old,accountType:'EOA'}],Array.from({length:50},(_,i)=>({...old,id:String(i)}))])assert.throws(()=>developerAdditionalWallet(invalid,network),e=>e.status===409)
}
const mocks={
 './privy-circle-link.js':`export const circleLinkKey=(_u,n)=>n;export const readCircleLink=async k=>globalThis.walletFixture.links[k]??null;export const findPaymentCircleLinkByWallet=async()=>null;export const verifiedPrivyUser=async()=>{if(globalThis.walletFixture.denied)throw Object.assign(Error('Sign in required'),{status:401});return {userId:'builder',email:'builder@example.test'}};export const compareAndSetCircleLink=async(k,v)=>{if(globalThis.walletFixture.conflict)throw Object.assign(Error('Wallet changed'),{status:409});globalThis.walletFixture.links[k]=v;globalThis.walletFixture.writes++}`,
 './pocket/wallet-additional-migration.js':`export const readAdditionalMigration=async()=>{throw Error('Migration must not run')};export const buildAdditionalMigration=()=>{throw Error('Migration must not run')};export const saveAdditionalMigration=async()=>{throw Error('Migration must not run')};export const activateAdditionalMigration=async()=>{throw Error('Migration must not run')}`,
}
await build({entryPoints:['api/circle-solana-email.ts'],outfile:'.codex-temp/developer-wallet-handler-fixture.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]})
process.env.CIRCLE_API_KEY='fixture-no-network'
const {default:handler}=await import('../.codex-temp/developer-wallet-handler-fixture.mjs')
const link=(w,chain)=>({privyUserId:'builder',chain,purpose:'payment',circleWalletId:w.id,circleWalletAddress:w.address,circleBlockchain:w.blockchain})
globalThis.walletFixture={links:{base:link(anchor,'base')},inventory:[anchor,original,candidate],writes:0}
const savedFetch=globalThis.fetch
globalThis.fetch=async(url,options)=>{assert.ok(!options?.method||options.method==='GET','Receiving recovery must not create or move funds');const u=new URL(url);if(u.pathname==='/v1/w3s/wallets')return Response.json({data:{wallets:walletFixture.inventory}});const id=u.pathname.split('/').at(-1);const wallet=walletFixture.inventory.find(w=>w.id===id);assert.ok(wallet,'Unexpected upstream call');return Response.json({data:{wallet}})}
async function call(extra={},status=200){let code=200,result;await handler({method:'POST',headers:{},body:{action:'prepareAdditionalPocketWallet',chain:'ethereum',userToken:'fixture-session',receivingSetup:true,...extra}},{setHeader(){},status(n){code=n;return this},json(v){result=v;return this}});assert.equal(code,status,JSON.stringify(result));return result}
try{
 assert.equal((await call()).wallet.id,'original');assert.equal(walletFixture.writes,1)
 assert.equal((await call()).wallet.id,'original');assert.equal(walletFixture.writes,1,'Linked wallet reused without replacement')
 delete walletFixture.links.ethereum;walletFixture.conflict=true;await call({},409);assert.equal(walletFixture.writes,1);walletFixture.conflict=false
 walletFixture.inventory.push({...original,id:'second-original'});await call({},409);assert.equal(walletFixture.writes,1);walletFixture.inventory.pop()
 walletFixture.denied=true;await call({},401);walletFixture.denied=false
 // Released Pocket clients omit receivingSetup. First-time linking must recover
 // the same original without creating a replacement or migrating funds.
 assert.equal((await call({receivingSetup:undefined})).wallet.id,'original');assert.equal(walletFixture.writes,2)
 delete walletFixture.links.ethereum
 assert.equal((await call({receivingSetup:false})).wallet.id,'original');assert.equal(walletFixture.writes,3)
 delete walletFixture.links.ethereum
 walletFixture.inventory.push({...original,id:'second-original'})
 await call({receivingSetup:undefined},409);assert.equal(walletFixture.writes,3)
 walletFixture.inventory.pop()
 walletFixture.inventory=[anchor,{...original,blockchain:'MATIC'},{...candidate,blockchain:'MATIC'}]
 assert.equal((await call({chain:'polygon',receivingSetup:undefined})).wallet.id,'original');assert.equal(walletFixture.writes,4)
}finally{globalThis.fetch=savedFetch}
console.log('PASS receiving-wallet recovery: Ethereum/Polygon originals, linked reuse, candidate exclusion, ambiguous history, auth, concurrent link conflict and no migration or funds movement.')

// Real incident shape: two canonical five-chain batches, with Base already
// linked to one batch. Recency and inventory ordering must not choose the wallet.
const canonicalRef='pocket:canonical-evm:v1'
const activeBase={...anchor,refId:canonicalRef,createDate:'2026-10-27T08:29:20Z'}
const oldBase={...activeBase,id:'old-base',address:oldAddress,createDate:'2026-10-27T08:29:08Z'}
for(const [network,blockchain] of [['ethereum','ETH'],['polygon','MATIC']]){
 const active={...activeBase,id:'active-'+network,blockchain}
 const old={...oldBase,id:'old-'+network,blockchain}
 const inventory=[old,activeBase,active,oldBase]
 assert.equal(developerAdditionalWallet(inventory,network,activeBase).id,active.id)
 assert.equal(developerAdditionalWallet([...inventory].reverse(),network,activeBase).id,active.id)
 assert.equal(developerAdditionalWallet(inventory,network,oldBase).id,old.id,'Existing anchor wins even when older')
 for(const invalid of [
  inventory.filter(w=>w.id!==activeBase.id),
  [...inventory,{...active,id:'duplicate-matching'}],
  inventory.map(w=>w.id===active.id?{...w,state:'FROZEN'}:w),
  inventory.map(w=>w.id===old.id?{...w,refId:''}:w),
  inventory.map(w=>w.id===active.id?{...w,createDate:'2026-10-28T08:29:20Z'}:w),
  inventory.map(w=>w.id===active.id?{...w,refId:'pocket:evm-candidate:v2:replacement'}:w).concat({...old,id:'another-old'}),
 ])assert.throws(()=>developerAdditionalWallet(invalid,network,activeBase),e=>e.status===409)
 assert.throws(()=>developerAdditionalWallet(inventory,network,{...activeBase,id:'foreign'}),e=>e.status===409)
 assert.throws(()=>developerAdditionalWallet(inventory,network,{...activeBase,refId:''}),e=>e.status===409)
}
walletFixture.links={base:link(activeBase,'base')};walletFixture.writes=0
walletFixture.inventory=[activeBase,oldBase,...['ETH','MATIC'].flatMap(blockchain=>[{...activeBase,id:'active-'+blockchain,blockchain},{...oldBase,id:'old-'+blockchain,blockchain}])]
const frozenInventory=JSON.stringify(walletFixture.inventory)
globalThis.fetch=async(url,options)=>{assert.ok(!options?.method||options.method==='GET');const u=new URL(url);if(u.pathname==='/v1/w3s/wallets')return Response.json({data:{wallets:walletFixture.inventory}});const wallet=walletFixture.inventory.find(w=>w.id===u.pathname.split('/').at(-1));assert.ok(wallet);return Response.json({data:{wallet}})}
try{
 assert.equal((await call()).wallet.id,'active-ETH')
 assert.equal((await call({chain:'polygon'})).wallet.id,'active-MATIC')
 assert.equal(walletFixture.writes,2)
 assert.equal(JSON.stringify(walletFixture.inventory),frozenInventory,'No historical wallet changed')
 assert.equal((await call()).wallet.id,'active-ETH')
 assert.equal(walletFixture.writes,2,'Repeat setup reuses link')
}finally{globalThis.fetch=savedFetch}
console.log('PASS duplicate canonical batches recover the verified anchor batch for Ethereum and Polygon; history preserved and ambiguous/untrusted matches rejected.')
