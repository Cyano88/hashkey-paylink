import {build} from 'esbuild'
import fs from 'node:fs'
fs.mkdirSync('.codex-temp',{recursive:true})
const mocks={
'./payment-security.js':`export const consumePocketPaymentApproval=async(token,owner)=>{if(token!=='single-use-fixture-'+owner||globalThis.fixture.usedApproval)return false;globalThis.fixture.usedApproval=true;return true}`,
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
const call=async(body,expected=200,headers={})=>{let status=200,result;await handler({method:'POST',body,headers},{setHeader(){},status(s){status=s;return this},json(data){result=data;return this},sendStatus(s){status=s}});assert.equal(status,expected,JSON.stringify(result));return result}
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

fixture.owner='payer';const readyAfterDelete=(await call({...body,key:'fixture-unique-key-0003'})).payment;const pendingAfterDelete=(await call({...body,key:'fixture-unique-key-0004'})).payment;await call({action:'authorize',id:pendingAfterDelete.id});await call({action:'merchant-delete',id:merchant.id},404);fixture.owner='merchant';await call({action:'merchant-delete',id:merchant.id},403);
const third=(await call({action:'merchant-save',create:true,wallet:to,name:'Second link',tokens:[token]})).merchant;assert.notEqual(third.id,merchant.id);assert.equal((await call({action:'mine'})).merchants.length,2);
await call({action:'merchant-delete',id:merchant.id},200,{'x-pocket-payment-approval':'single-use-fixture-merchant'});await call({action:'merchant',id:merchant.id},404);assert.equal((await call({action:'mine'})).merchants.length,1);assert.equal((await call({action:'mine'})).payments.length,4);await call({action:'merchant-delete',id:third.id},403,{'x-pocket-payment-approval':'single-use-fixture-merchant'});
fixture.owner='payer';await call({...body,key:'fixture-unique-key-after-delete'},400);
console.log('PASS independent reusable links; owner-only, one-time PIN approval deletion; deleted QR rejected; payment history retained')

await call({action:'authorize',id:readyAfterDelete.id},409);const finalHash='0x'+'c'.repeat(64);fixture.head=160n;fixture.receipts[finalHash]={...fixture.receipts[hash],blockNumber:150n};assert.equal((await call({action:'confirm',id:pendingAfterDelete.id,hash:finalHash})).payment.status,'paid');console.log('PASS deleted links reject unsigned quotes and still settle pre-authorized payments');

const readPublic=async(id,expected)=>{let status=200,result;await handler({method:'GET',query:{id}},{setHeader(){},status(s){status=s;return this},json(data){result=data;return this},sendStatus(s){status=s}});assert.equal(status,expected);return result};
const publicLink=await readPublic(third.id,200);assert.deepEqual(Object.keys(publicLink.merchant).sort(),['id','name','pocketId','tokens']);await readPublic(merchant.id,404);await readPublic('../mine',400);console.log('PASS public merchant read exposes no wallet, owner, or payment records; deleted links rejected');

// PIN entry may take longer than the old 90-second quote lifetime. The fixed
// reviewed amount remains bounded, and expiry must never authorize a transfer.
fixture.owner='payer';
const realNow=Date.now;
try {
 const start=realNow();Date.now=()=>start;
 const slow=(await call({...body,id:third.id,key:'fixture-slow-pin-0001'})).payment;
 const expired=(await call({...body,id:third.id,key:'fixture-expired-pin-0002'})).payment;
 assert.equal(slow.expiresAt-start,300000);
 Date.now=()=>start+300000;
 await call({action:'authorize',id:expired.id},409);
 assert.equal((await call({action:'status',id:expired.id})).payment.status,'ready');
 Date.now=()=>start+120000;
 const authorized=(await call({action:'authorize',id:slow.id})).payment;
 assert.equal(authorized.status,'submitted');
 assert.equal(authorized.amount,slow.amount);
 assert.equal(authorized.recipient,slow.recipient);
 await call({action:'authorize',id:slow.id},409);
 console.log('PASS slow PIN approval preserves reviewed amount; exact five-minute expiry rejects; duplicate authorization rejected');
} finally {Date.now=realNow}
