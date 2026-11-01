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
 // Original Pocket alignment behavior is unchanged without the receiving-only flag.
 await call({receivingSetup:false},500);assert.equal(walletFixture.writes,1)
}finally{globalThis.fetch=savedFetch}
console.log('PASS receiving-wallet recovery: Ethereum/Polygon originals, linked reuse, candidate exclusion, ambiguous history, auth, concurrent link conflict and no migration or funds movement.')
