import {build} from 'esbuild'
import fs from 'node:fs'
fs.mkdirSync('.codex-temp',{recursive:true})
const mocks={
'../local-currency-profile.js':`export const verifiedPrivyUser=async()=>({userId:globalThis.fixture.owner});export const localCurrencyProfileRepository={ensure:async()=>({profile:{pocketId:'12345678'}})}`,
'../render-durable-store.js':`let state;export const readDurableJson=async()=>structuredClone(state);export const mutateDurableJson=async(k,fn)=>{state=await fn(structuredClone(state));return structuredClone(state)}`,
'./xstocks-wallet-owner.js':`export const verifyStockWalletOwner=async(owner,wallet)=>{if(globalThis.fixture.wallets[owner]!==wallet)throw Object.assign(Error('Wrong wallet'),{status:403})}`,
'./xstocks-notifications-store.js':`export const stockNoticeClient={getChainId:async()=>196,getLogs:async()=>globalThis.fixture.logs||[],getTransactionReceipt:async({hash})=>{if(!globalThis.fixture.receipts[hash])throw Error('pending');return globalThis.fixture.receipts[hash]},getBlock:async({blockNumber}={})=>({number:blockNumber||globalThis.fixture.head||100n,hash:'block',timestamp:BigInt(Math.floor(Date.now()/1000))})};export const stockNoticeAsset=async(token)=>({address:token,symbol:'NVDAx',decimals:18});export const mutateStockNotices=async fn=>fn({notices:{}});export const putStockNotice=()=>{}`,
'./xstocks-prices.js':`export const readStockMarketPrices=async tokens=>Object.fromEntries(tokens.map(t=>[t,{usd:200,fetchedAt:Date.now()}]))`
}
await build({entryPoints:['api/pocket/xpay.ts'],outfile:'.codex-temp/xpay-handler-test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'js'}))}}]})
const {default:handler}=await import('../.codex-temp/xpay-handler-test.mjs')
const {stockAssets}=await import('../src/pocket/lib/pocketXStocksWallet.ts')
const {encodeEventTopics,encodeAbiParameters,parseAbiItem}=await import('viem')
const assert=(await import('node:assert/strict')).default
const from='0x'+'1'.repeat(40),to='0x'+'2'.repeat(40),token=stockAssets[0].address.toLowerCase(),hash='0x'+'a'.repeat(64)
globalThis.fixture={owner:'merchant',wallets:{merchant:to,payer:from},receipts:{}}
const call=async(body,expected=200)=>{let status=200,result;await handler({method:'POST',body},{setHeader(){},status(s){status=s;return this},json(data){result=data;return this},sendStatus(s){status=s}});assert.equal(status,expected,JSON.stringify(result));return result}
await call({action:'merchant-save',wallet:from,name:'Fixture',tokens:[token]},403)
const merchant=(await call({action:'merchant-save',wallet:to,name:'Fixture',tokens:[token]})).merchant
fixture.owner='payer'
const body={action:'prepare',id:merchant.id,wallet:from,token,usd:'1.00',key:'fixture-unique-key-0001'}
const p=(await call(body)).payment;assert.equal((await call(body)).payment.id,p.id)
await call({...body,usd:'2'},409)
await call({action:'confirm',id:p.id,hash},409)
await call({action:'authorize',id:p.id});await call({action:'authorize',id:p.id},409)
await call({...body,key:'fixture-unique-key-0002'},409)
assert.equal((await call({action:'confirm',id:p.id,hash})).payment.status,'submitted')
fixture.owner='merchant';await call({action:'status',id:p.id},404);fixture.owner='payer'
const event=parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
fixture.receipts[hash]={status:'success',blockNumber:110n,blockHash:'block',logs:[{address:token,topics:encodeEventTopics({abi:[event],eventName:'Transfer',args:{from,to}}),data:encodeAbiParameters([{type:'uint256'}],[5000000000000000n])}]}
fixture.head=120n;assert.equal((await call({action:'status',id:p.id})).payment.status,'paid')
assert.equal((await call({action:'confirm',id:p.id,hash})).payment.status,'paid')
const second=(await call({...body,key:'fixture-unique-key-0002'})).payment
await call({action:'authorize',id:second.id});await call({action:'confirm',id:second.id,hash},409)
fixture.head=140n;const recoveredHash='0x'+'b'.repeat(64);fixture.logs=[{args:{value:5000000000000000n},transactionHash:recoveredHash}];fixture.receipts[recoveredHash]={...fixture.receipts[hash],blockNumber:130n};assert.equal((await call({action:'status',id:second.id})).payment.status,'paid');
console.log('PASS lost-hash chain recovery; server merchant ownership, idempotency, changed details rejection, authorize once, active-payment guard, ownership isolation, verified settlement, hash replay guard')
