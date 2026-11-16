import {build} from 'esbuild'
import fs from 'node:fs'
fs.mkdirSync('.codex-temp',{recursive:true})
const mocks={
'../qr-purchase-allowance.js':`export const reserveQrWalletAllowance=async(owner,input)=>{globalThis.fixture.allowances??=[];globalThis.fixture.allowances.push({owner,...input})}`,
'../checkout-wallet-allowance.js':`export const checkCheckoutWalletAllowance=async()=>{}`,
'../checkout-selection.js':`export const claimCheckoutSelectionPayment=async()=>{}`,
'../developer-receipt-settings.js':`export const readDeveloperReceiptSettings=async()=>globalThis.fixture.emailEnabled?{enabled:true}:undefined`,
'../hosted-stock-checkouts.js':`export const readStockCheckoutBranding=async()=>new Map();export const isStockCheckoutId=id=>typeof id==='string'&&/^chkx_[a-f0-9]{24}$/.test(id);export const readStockCheckout=async id=>globalThis.fixture.stockCheckout?.id===id?globalThis.fixture.stockCheckout:null;export const assertStockCheckoutPayable=async()=>{if(globalThis.fixture.stockDisabled)throw Object.assign(Error('Checkout disabled'),{status:409})};export const settleStockCheckout=async proof=>{globalThis.fixture.stockSettled=proof;globalThis.fixture.stockCheckout.payment={status:'paid',txHash:proof.hash}}`,
'./payment-security.js':`export const consumePocketPaymentApproval=async(token,owner)=>{if(token!=='single-use-fixture-'+owner||globalThis.fixture.usedApproval)return false;globalThis.fixture.usedApproval=true;return true}`,
'../local-currency-profile.js':`export const verifiedPrivyUser=async()=>({userId:globalThis.fixture.owner,email:globalThis.fixture.email});export const localCurrencyProfileRepository={ensure:async()=>({profile:{pocketId:'12345678'}})}`,
'../render-durable-store.js':`let state;export const readDurableJson=async(key)=>structuredClone(key==='pocket:unified-xpay:v1'?globalThis.fixture.unified:state||globalThis.fixture.seed);export const mutateDurableJson=async(k,fn)=>{state=await fn(structuredClone(state||globalThis.fixture.seed));globalThis.fixture.saved=state;return structuredClone(state)}`,
'./xstocks-wallet-owner.js':`export const verifyStockWalletOwner=async(owner,wallet)=>{if(globalThis.fixture.wallets[owner]!==wallet)throw Object.assign(Error('Wrong wallet'),{status:403})}`,
'./xstocks-notifications-store.js':`export const stockNoticeClient={getChainId:async()=>196,getLogs:async()=>globalThis.fixture.logs||[],getTransactionReceipt:async({hash})=>{if(!globalThis.fixture.receipts[hash])throw Error('pending');return globalThis.fixture.receipts[hash]},getBlock:async({blockNumber}={})=>({number:blockNumber||globalThis.fixture.head||100n,hash:'block',timestamp:BigInt(Math.floor(Date.now()/1000))})};export const stockNoticeAsset=async(token)=>({address:token,symbol:'NVDAx',decimals:18});export const mutateStockNotices=async fn=>fn({notices:{}});export const putStockNotice=(_s,n)=>{globalThis.fixture.notices??=[];globalThis.fixture.notices.push(n)}`,
'./xstocks-prices.js':`export const readStockMarketPrices=async tokens=>Object.fromEntries(tokens.map(t=>[t,{usd:200,fetchedAt:Date.now()}]))`
}
await build({entryPoints:['api/pocket/xpay.ts'],outfile:'.codex-temp/xpay-retired-handler-test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'js'}))}}]})
const {default:handler,listPocketUnifiedXPayStockPayments,verifyXPayTransfer}=await import('../.codex-temp/xpay-retired-handler-test.mjs')
const {stockAssets}=await import('../src/pocket/lib/pocketXStocksWallet.ts')
const {encodeEventTopics,encodeAbiParameters,parseAbiItem}=await import('viem')
const assert=(await import('node:assert/strict')).default
const from='0x'+'1'.repeat(40),to='0x'+'2'.repeat(40),token=stockAssets[0].address.toLowerCase(),hash='0x'+'a'.repeat(64)
globalThis.fixture={owner:'merchant',wallets:{merchant:to,payer:from},receipts:{}}
const call=async(body,expected=200,headers={})=>{let status=200,result;await handler({method:'POST',body,headers},{setHeader(){},status(s){status=s;return this},json(data){result=data;return this},sendStatus(s){status=s}});assert.equal(status,expected,JSON.stringify(result));return result}
await call({action:'merchant-save',wallet:to,name:'Fixture',tokens:[token]},409)
const merchant={id:'11111111-1111-4111-8111-111111111111',owner:'merchant',name:'Historical QR',wallet:to,tokens:[token],updatedAt:1,pocketId:'12345678'}
const old={id:'old-payment',key:'fixture-unique-key-0001',owner:'payer',merchantOwner:'merchant',merchantId:merchant.id,merchantName:merchant.name,payer:from,recipient:to,token,symbol:'NVDAx',amount:'0.005',units:'5000000000000000',usd:'1.00',status:'ready',createdAt:Date.now(),updatedAt:Date.now(),expiresAt:Date.now()+60000}
fixture.seed={merchants:{[merchant.id]:merchant},payments:{[old.id]:old},hashes:{}}
fixture.owner='payer'
const body={action:'prepare',id:merchant.id,wallet:from,token,usd:'1.00',key:old.key}
await call({...body,key:'brand-new-stock-qr-0001'},409)
const p=(await call(body)).payment;assert.equal(p.id,old.id)
await call({...body,usd:'2'},409)
await call({action:'authorize',id:p.id});await call({action:'authorize',id:p.id},409)
const event=parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
fixture.receipts[hash]={status:'success',blockNumber:110n,blockHash:'block',logs:[{logIndex:0,address:token,topics:encodeEventTopics({abi:[event],eventName:'Transfer',args:{from,to}}),data:encodeAbiParameters([{type:'uint256'}],[5000000000000000n])}]}
fixture.head=120n;assert.equal((await call({action:'confirm',id:p.id,hash})).payment.status,'paid')
assert.equal((await call({action:'status',id:p.id})).payment.status,'paid')
fixture.owner='merchant';await call({action:'status',id:p.id},404)
assert.equal((await listPocketUnifiedXPayStockPayments('merchant')).length,1)
const readPublic=async(id,expected)=>{let status=200,result;await handler({method:'GET',query:{id}},{setHeader(){},status(s){status=s;return this},json(v){result=v;return this}});assert.equal(status,expected);return result}
console.log('PASS retired QR setup/prepare rejection, immutable recovery, confirmation and scoped history.')
// A developer checkout reuses this payment engine with immutable token units.
fixture.owner='stock-payer';fixture.wallets['stock-payer']='0x'+'4'.repeat(40);
fixture.stockCheckout={id:'chkx_'+'1'.repeat(24),ownerId:'merchant',merchantName:'Developer merchant',recipient:to,amount:'0.123456789',token:{address:token},createdAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),swapEnabled:false};
fixture.email='verified@example.test';fixture.emailEnabled=true;
const stockBody={receiptEmail:'spoofed@example.test',action:'prepare',id:fixture.stockCheckout.id,wallet:fixture.wallets['stock-payer'],token,usd:'9999',key:'fixture-stock-checkout-0001'};
const hostedPublic=await readPublic(fixture.stockCheckout.id,200);assert.equal(hostedPublic.merchant.fixedAmount,fixture.stockCheckout.amount);assert.equal(hostedPublic.merchant.expiresAt,Date.parse(fixture.stockCheckout.expiresAt));assert.equal(hostedPublic.merchant.wallet,undefined);assert.equal(hostedPublic.merchant.owner,undefined);
fixture.owner='merchant';const self=(await call({...stockBody,wallet:to},400));assert.match(self.error,/own account/);assert.doesNotMatch(self.error,/XPay|QR/);fixture.owner='stock-payer';
const stockPayment=(await call(stockBody)).payment;
assert.equal(stockPayment.amount,'0.123456789','Client USD input cannot change fixed token units');
assert.equal(stockPayment.receiptEmail,undefined);assert.equal(fixture.saved.payments[stockPayment.id].receiptEmail,'verified@example.test');
assert.ok(stockPayment.expiresAt<=Date.parse(fixture.stockCheckout.expiresAt));
assert.equal((await call({...stockBody,usd:'1'})).payment.id,stockPayment.id);
fixture.owner='other-stock-payer';fixture.wallets['other-stock-payer']='0x'+'5'.repeat(40);
const concurrent=(await call({...stockBody,wallet:fixture.wallets['other-stock-payer'],key:'fixture-stock-checkout-0002'})).payment;
fixture.owner='stock-payer';fixture.stockDisabled=true;await call({action:'authorize',id:stockPayment.id},409);fixture.stockDisabled=false;
await call({action:'authorize',id:stockPayment.id});
assert.equal((await call({action:'merchant',id:fixture.stockCheckout.id})).payments.find(p=>p.id===stockPayment.id).status,'submitted');
fixture.owner='other-stock-payer';await call({action:'authorize',id:concurrent.id},409);
assert.equal((await call({action:'merchant',id:fixture.stockCheckout.id})).payments.some(p=>p.id===stockPayment.id),false);
fixture.owner='stock-payer';const stockHash='0x'+'d'.repeat(64);fixture.head=200n;
fixture.receipts[stockHash]={status:'success',blockNumber:190n,blockHash:'block',logs:[{logIndex:0,address:token,topics:encodeEventTopics({abi:[event],eventName:'Transfer',args:{from:fixture.wallets['stock-payer'],to}}),data:encodeAbiParameters([{type:'uint256'}],[123456789000000000n])}]};
assert.equal((await call({action:'confirm',id:stockPayment.id,hash:stockHash})).payment.status,'paid');
assert.deepEqual(fixture.notices.slice(-2).map(n=>n.title),['Web payment sent','Web payment received']);
assert.equal(fixture.stockSettled.id,fixture.stockCheckout.id);assert.equal(fixture.stockSettled.units,'123456789000000000');
await call({...stockBody,key:'fixture-stock-checkout-0003'},409);
console.log('PASS shared developer stock engine: fixed units, disabled-project authorization, concurrent payer lock, verified settlement and paid-order replay rejection.');

const {xLayerFeeAssets}=await import('../src/pocket/lib/pocketXLayerFeeAssets.ts')
const {EVM_PLATFORM_TREASURY,EVM_GAS_REIMBURSEMENT}=await import('../src/lib/platformFees.ts')
const {formatUnits}=await import('viem')
for(const [symbol,{address,decimals}]of Object.entries(xLayerFeeAssets)){
 const gross=10n**BigInt(decimals),fee=gross*25n/10000n+250n,net=gross-fee,stamp=Date.now()
 const p={payer:from,recipient:to,token:address,units:String(gross),authorizedAt:stamp-1000,feePayer:'merchant',fees:{payer:'merchant',platformFee:formatUnits(gross*25n/10000n,decimals),networkFee:formatUnits(250n,decimals),netAmount:formatUnits(net,decimals)}}
 const log=(recipient,units)=>({address,topics:encodeEventTopics({abi:[event],eventName:'Transfer',args:{from,to:recipient}}),data:encodeAbiParameters([{type:'uint256'}],[units])})
 const logs=[log(to,net),log(EVM_PLATFORM_TREASURY,fee)]
 assert.equal(verifyXPayTransfer(p,{status:'success',logs},stamp),true)
 const current={...p,feeRoutingVersion:2},split=[log(to,net),log(EVM_PLATFORM_TREASURY,gross*25n/10000n),log(EVM_GAS_REIMBURSEMENT,250n)]
 assert.equal(verifyXPayTransfer(current,{status:'success',logs:split},stamp),true)
 assert.equal(verifyXPayTransfer(current,{status:'success',logs},stamp),false,'new quotes reject legacy combined fee movement')
 assert.equal(verifyXPayTransfer(current,{status:'success',logs:split.slice(0,2)},stamp),false,'missing gas cannot settle')
 assert.equal(verifyXPayTransfer(p,{status:'success',logs:split},stamp),false,'legacy proof remains bound to original fee topology')
 assert.equal(verifyXPayTransfer(p,{status:'success',logs:logs.slice(0,1)},stamp),false)
 assert.equal(verifyXPayTransfer(p,{status:'success',logs:[log(to,gross),logs[1]]},stamp),false)
}
console.log('PASS all four X Layer stablecoins require exact merchant net and full fee proof.')

assert.ok(fixture.allowances.some(a=>a.owner==='payer'&&a.network==='xlayer'&&a.asset==='NVDAx'&&a.usdAmount===body.usd&&Number(a.amount)===Number(body.usd)/200),'Ordinary stock QR authorizations must reserve their USD purchase value');
