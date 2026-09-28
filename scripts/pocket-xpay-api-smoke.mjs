import {build} from 'esbuild'
import fs from 'node:fs'
fs.mkdirSync('.codex-temp',{recursive:true})
const mocks={
'./payment-security.js':`export const consumePocketPaymentApproval=async(token,owner)=>{if(token!=='single-use-fixture-'+owner||globalThis.fixture.usedApproval)return false;globalThis.fixture.usedApproval=true;return true}`,
'../local-currency-profile.js':`export const verifiedPrivyUser=async()=>({userId:globalThis.fixture.owner});export const localCurrencyProfileRepository={ensure:async()=>({profile:{pocketId:'12345678'}})}`,
'../render-durable-store.js':`let state;export const readDurableJson=async(key)=>structuredClone(key==='pocket:unified-xpay:v1'?globalThis.fixture.unified:state);export const mutateDurableJson=async(k,fn)=>{state=await fn(structuredClone(state));return structuredClone(state)}`,
'./xstocks-wallet-owner.js':`export const verifyStockWalletOwner=async(owner,wallet)=>{if(globalThis.fixture.wallets[owner]!==wallet)throw Object.assign(Error('Wrong wallet'),{status:403})}`,
'./xstocks-notifications-store.js':`export const stockNoticeClient={getChainId:async()=>196,getLogs:async()=>globalThis.fixture.logs||[],getTransactionReceipt:async({hash})=>{if(!globalThis.fixture.receipts[hash])throw Error('pending');return globalThis.fixture.receipts[hash]},getBlock:async({blockNumber}={})=>({number:blockNumber||globalThis.fixture.head||100n,hash:'block',timestamp:BigInt(Math.floor(Date.now()/1000))})};export const stockNoticeAsset=async(token)=>({address:token,symbol:'NVDAx',decimals:18});export const mutateStockNotices=async fn=>fn({notices:{}});export const putStockNotice=()=>{}`,
'./xstocks-prices.js':`export const readStockMarketPrices=async tokens=>Object.fromEntries(tokens.map(t=>[t,{usd:200,fetchedAt:Date.now()}]))`
}
await build({entryPoints:['api/pocket/xpay.ts'],outfile:'.codex-temp/xpay-handler-test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'js'}))}}]})
const {default:handler,listPocketUnifiedXPayStockPayments}=await import('../.codex-temp/xpay-handler-test.mjs')
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

fixture.owner='merchant';
const setup={action:'merchant-save',create:true,key:'fixture-setup-key-001',wallet:to,name:'Unified setup',tokens:[token]};
const setupMerchant=(await call(setup)).merchant;
assert.equal((await call(setup)).merchant.id,setupMerchant.id);
await call({...setup,name:'Changed'},409);
assert.equal(setupMerchant.createKey,undefined);
const unifiedId='xp_11111111-1111-4111-8111-111111111111';
fixture.unified={checkouts:[{id:unifiedId,owner:'merchant',name:'Unified',destinationIds:[setupMerchant.id],revisions:[String(setupMerchant.updatedAt)],key:'fixture-unified-key',createdAt:Date.now()}]};
fixture.owner='payer2';fixture.wallets.payer2='0x'+'3'.repeat(40);
const unifiedBody={action:'prepare',id:setupMerchant.id,wallet:fixture.wallets.payer2,token,usd:'2',key:'fixture-unified-pay-001',checkoutId:unifiedId};
const unifiedPayment=(await call(unifiedBody)).payment;
assert.equal(unifiedPayment.checkoutId,unifiedId);
await call({...unifiedBody,checkoutId:undefined},409);
fixture.unified.checkouts[0].deletedAt=Date.now();await call({action:'authorize',id:unifiedPayment.id},409);
delete fixture.unified.checkouts[0].deletedAt;
fixture.unified.checkouts[0].revisions=['changed'];await call({action:'authorize',id:unifiedPayment.id},409);
fixture.unified.checkouts[0].revisions=[String(setupMerchant.updatedAt)];
await call({action:'authorize',id:unifiedPayment.id});
assert.deepEqual((await listPocketUnifiedXPayStockPayments('merchant',unifiedId)).map(p=>p.id),[unifiedPayment.id]);
assert.equal((await listPocketUnifiedXPayStockPayments('payer2',unifiedId)).length,0);
console.log('PASS unified setup retries; QR binding, revision/deletion guards, immutable replay and owner-only history');
