import {build} from 'esbuild'
import assert from 'node:assert/strict'
import {encodeEventTopics,encodeAbiParameters,parseAbiItem} from 'viem'
const mocks={
 './xpay-bank-payout.js':`export const prepareXPayBankPayout=async()=>{};export const validateXPayBankChoice=async()=>{};export const checkXPayPayout=async()=>{};export const confirmXPayPayout=async()=>{};export const xpayPayoutCall=()=> '0x1234'`,
 './xpay-bridge-service.js':`export const createXPayBridgeService=()=>({})`,
 '../circle-solana-email.js':`export const createCircleGasStationEvmChallenge=async()=>{};export const readCircleEvmChallenge=async()=>{}`,
 './payment-security.js':`export const consumePocketPaymentApproval=async()=>false`,
 './xstocks-swap-provider.js':`export const quoteStockSwap=async()=>{}`,
 './xstocks-prices.js':`export const readStockMarketPrices=async()=>({})`,
 './xstocks-notifications-store.js':`export const stockNoticeClient={}`,
 './xstocks-wallet-owner.js':`export const verifyStockWalletOwner=async()=>{}`,
 '../render-durable-store.js':`const stores=new Map();export const readDurableJson=async k=>structuredClone(stores.get(k));export const mutateDurableJson=async(k,fn)=>{const next=await fn(structuredClone(stores.get(k)));stores.set(k,structuredClone(next));return next}`,
}
await build({entryPoints:['api/pocket/xpay-bank-service.ts'],outfile:'.codex-temp/xpay-bank-test.mjs',bundle:true,format:'esm',platform:'node',packages:'external',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]})
const {createXPayBankService}=await import('../.codex-temp/xpay-bank-test.mjs')
const {stockAssets,stockUsdc}=await import('../src/pocket/lib/pocketXStocksWallet.ts')
const owner='alice',source='0x'+'1'.repeat(40),destination='0x'+'2'.repeat(40),router='0x'+'3'.repeat(40),hash='0x'+'4'.repeat(64),blockHash='0x'+'5'.repeat(64),paymentHash='0x'+'6'.repeat(64)
const quote={id:'quote',chainId:196,owner:source,tokenIn:stockAssets[0],tokenOut:stockUsdc,amount:'0.005',amountUnits:'5000000000000000',decimalsIn:18,decimalsOut:6,expectedOut:'1.02',minimumOut:'1.01',minimumOutUnits:'1010000',expiresAt:Date.now()+45000,gasFee:'0.00001',spender:router,tx:{from:source,to:router,data:'0x1234',value:'0'}}
const payout={intentId:'intent',merchantId:'merchant',fiatAmount:'1000.00',fundingUnits:'1000000',wallet:destination,walletId:'base-wallet',recipient:router,expiresAt:Date.now()+300000}
const bridgeRecord={id:'bridge',plan:{destination,destinationWalletId:'base-wallet',minimumReceiveUnits:'1000000',burnUnits:'1000141'},state:'quoted'}
let gas=1000000n,head=100n,receiptStatus='success',bridgeState='quoted',challengeLost=true,expired=false,payoutProved=false
let prepares=0,swapCalls=0,burnCalls=0,mintCalls=0,checks=0;const keys=[]
const ev=parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)')
const log=(token,from,to,value)=>({address:token,topics:encodeEventTopics({abi:[ev],eventName:'Transfer',args:{from,to}}),data:encodeAbiParameters([{type:'uint256'}],[value])})
const client={getChainId:async()=>196,getBlock:async()=>({number:head,hash:blockHash,timestamp:BigInt(Math.floor(Date.now()/1000))}),readContract:async()=>10n**20n,getGasPrice:async()=>1n,getBalance:async()=>gas,estimateGas:async()=>100n,getTransaction:async()=>({from:source,to:router,input:'0x1234',value:0n}),getTransactionReceipt:async()=>({status:receiptStatus,blockNumber:101n,blockHash,logs:[log(stockAssets[0].address,source,router,5000000000000000n),log(stockUsdc.address,router,source,1010000n)]}),getLogs:async()=>[{transactionHash:hash}]}
const service=createXPayBankService({source:client,owns:async(o,s)=>{assert.equal(o,owner);assert.equal(s,source)},preparePayout:async()=>{prepares++;return payout},choice:async()=>{},checkPayout:async()=>{checks++;if(expired)throw Error('quote expired')},confirmPayout:async(_,h)=>{assert.equal(h,paymentHash);if(!payoutProved)throw Error('not confirmed')},consumeApproval:async token=>token==='pin-approved',bridge:{prepare:async()=>structuredClone(bridgeRecord),authorizeBurn:async()=>{burnCalls++;bridgeState='burn_authorized';return {record:{...bridgeRecord,state:bridgeState},burn:{data:'0xab'}}},submitted:async()=>{bridgeState='burn_submitted'},status:async()=>({...bridgeRecord,state:bridgeState}),mint:async()=>{mintCalls++;return {challengeId:'mint'}}},funding:async()=>({amount:quote.amount,amountUnits:quote.amountUnits,swap:quote}),swapQuote:async()=>{swapCalls++;return {...quote,expiresAt:Date.now()+45000}},validateSwap:()=>{},challenge:async input=>{keys.push(input.idempotencyKey);if(challengeLost){challengeLost=false;throw Error('lost response')}return {challengeId:'pay-challenge'}},challengeStatus:async()=>({status:'pending',txHash:paymentHash})})
const input={key:'test-payment-00000001',checkoutId:'xp_11111111-1111-4111-8111-111111111111',merchantId:'merchant',source,token:stockAssets[0].address,fiatAmount:'1000'}
const r=await service.prepare({}, {userId:owner},input)
assert.equal((await service.prepare({}, {userId:owner},input)).id,r.id);assert.equal(prepares,1)
await assert.rejects(()=>service.prepare({}, {userId:owner},{...input,fiatAmount:'2000'}))
await assert.rejects(()=>service.approve('bob',r.id,'pin-approved'))
await assert.rejects(()=>service.approve(owner,r.id,'bad'))
await service.approve(owner,r.id,'pin-approved')
await assert.rejects(()=>service.payout(owner,r.id,'session'),/Wait for/)
gas=0n;await assert.rejects(()=>service.authorizeSwap(owner,r.id),/Not enough OKB/)
assert.equal((await service.status(owner,r.id)).state,'approved')
gas=1000000n;await service.authorizeSwap(owner,r.id)
await assert.rejects(()=>service.authorizeSwap(owner,r.id));await assert.rejects(()=>service.retry(owner,r.id))
// Lost submitted-hash response: the bounded scan recovers the original exact swap.
head=104n;assert.equal((await service.status(owner,r.id)).state,'swap_confirmed')
expired=true;await assert.rejects(()=>service.authorizeBridge(owner,r.id),/quote expired/);assert.equal(burnCalls,0)
expired=false;await service.authorizeBridge(owner,r.id);await service.submittedBridge(owner,r.id,hash)
assert.equal((await service.status(owner,r.id)).state,'bridging')
await assert.rejects(()=>service.payout(owner,r.id,'session'))
bridgeState='attested';await service.mint(owner,r.id,'session');assert.equal(mintCalls,1)
assert.equal((await service.status(owner,r.id)).state,'bridging')
bridgeState='completed';assert.equal((await service.status(owner,r.id)).state,'payout_ready')
await assert.rejects(()=>service.payout(owner,r.id,'session'),/lost response/)
const checksBefore=checks;expired=true
assert.equal((await service.payout(owner,r.id,'session')).challengeId,'pay-challenge')
assert.equal(checks,checksBefore);assert.equal(keys[0],keys[1])
await assert.rejects(()=>service.status(owner,r.id,'session'),/not confirmed/)
assert.equal((await service.list(owner))[0].state,'payout_submitted')
payoutProved=true;assert.equal((await service.status(owner,r.id,'session')).state,'successful')
assert.equal((await service.payout(owner,r.id,'session')).record.state,'successful')
assert.equal(keys.length,2);assert.equal(burnCalls,1);assert.equal(swapCalls,2)
console.log('PASS bank orchestration: ownership/PIN, replay, low OKB, lost swap hash recovery, expired-quote preservation, verified Base arrival gate, stable payout key after lost response, no hash-only success or repeated stages.')
