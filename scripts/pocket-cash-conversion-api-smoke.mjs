import assert from 'node:assert/strict'
import {cashFixture,owner,wallet,hash,rate} from './fixtures/cash-conversion.mjs'
import {sealCashConversion} from '../api/pocket/cash-conversion-quote.ts'
import {createCashConversionHandler,cashConversionReview} from '../api/pocket/cash-conversion.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='cash-api-fixture-'.repeat(4)
const {q,trace,now}=await cashFixture(),token=sealCashConversion(q)
let record=null,writes=0,approve=true,fee='0.00001',enabled=true,rpcDown=false,clock=now,proof=trace,provider={status:'pending',txHash:hash},balance='0x10000000',quoteReads=0
const d={identity:async()=>({userId:owner}),readLink:async()=>({privyUserId:owner,chain:'base',purpose:'payment',circleBlockchain:'BASE',circleWalletId:'wallet',circleWalletAddress:wallet}),enabled:()=>enabled,now:()=>clock,approval:async()=>approve,rate:async()=>rate,estimate:async()=>fee,quote:async()=>{quoteReads++;return q},list:async()=>record?[record]:[],find:async()=>record,
 claim:async input=>{if(record)return{claimed:false,record};record={...input,status:'started'};return{claimed:true,record}},record:async input=>{record=input;return input},
 challenge:async()=>{assert.equal(record.status,'started');writes++;throw Error('timeout after provider accepted')},recoverChallenge:async binding=>{assert.equal(binding.refId,'pocket:cash-conversion:'+q.id);return 'recovered'},challengeStatus:async()=>provider,
 rpc:async(_network,method)=>{if(rpcDown)throw Error('offline');return{eth_chainId:'0x2105',eth_call:balance,eth_getTransactionReceipt:{status:'0x1',blockHash:hash,transactionHash:hash,blockNumber:'0x10'},eth_getBlockByNumber:{hash},debug_traceTransaction:proof}[method]}}
const handler=createCashConversionHandler(d)
async function call(body,method='POST',target=handler){let status=200,data;await target({method,body,headers:{}},{setHeader(){},status(s){status=s;return this},json(b){data=b;return this}});return{status,data}}
assert.equal(cashConversionReview(q).feeAsset,'USDC');assert.equal(cashConversionReview(q).minimumOut,'9.92');assert.equal(cashConversionReview(q).expectedOut,'9.97')
enabled=false;assert.equal((await call({action:'execute',quoteToken:token})).status,409);assert.equal((await call({},'GET')).data.enabled,false);enabled=true
assert.equal((await call({action:'quote',network:'polygon',from:'USDT',to:'USDC',amount:'10'})).status,400)
balance='0x1';assert.equal((await call({action:'quote',network:'base',from:'USDT',to:'USDC',amount:'10'})).status,409);assert.equal(quoteReads,0);balance='0x10000000'
assert.equal((await call({action:'quote',network:'base',from:'USDT',to:'USDC',amount:'10'})).data.quote.expectedOut,'9.97')
approve=false;assert.equal((await call({action:'execute',quoteToken:token})).status,403);approve=true
fee='0.01';assert.equal((await call({action:'execute',quoteToken:token})).status,409);fee='0.00001';assert.equal(record,null)
clock+=50000;assert.equal((await call({action:'execute',quoteToken:token})).status,409);clock=now
const other=createCashConversionHandler({...d,identity:async()=>({userId:'other'})});assert.equal((await call({action:'execute',quoteToken:token},'POST',other)).status,409)
assert.equal((await call({action:'execute',quoteToken:token})).status,503);assert.equal(writes,1);assert.equal(record.status,'started')
await Promise.all([call({action:'execute',quoteToken:token}),call({action:'execute',quoteToken:token})]);assert.equal(writes,1,'lost response does not create a second challenge')
const changed=sealCashConversion({...q,id:'22222222-2222-4222-8222-222222222222'})
const conflict=createCashConversionHandler({...d,find:async()=>null});assert.equal((await call({action:'execute',quoteToken:changed},'POST',conflict)).status,409);assert.equal(writes,1,'new quote cannot bypass unresolved wallet claim')
provider={status:'awaiting_approval'};rpcDown=true;assert.equal((await call({action:'status',quoteToken:token,circleUserToken:'session'})).data.status,'awaiting_approval');assert.equal(record.metadata.challengeId,'recovered')
provider={status:'pending',txHash:hash};assert.equal((await call({action:'status',quoteToken:token,circleUserToken:'session'})).status,503);assert.equal(record.metadata.txHash,hash,'hash persists before proof RPC')
rpcDown=false;proof={type:'CALL'};assert.equal((await call({action:'status',quoteToken:token})).data.status,'pending');proof=trace
enabled=false;clock+=50000
const done=await call({action:'status',quoteToken:token});assert.equal(done.data.status,'completed');assert.equal(done.data.amountOut,'9.97');assert.equal(writes,1)
assert.equal((await call({action:'status',quoteToken:token})).data.status,'completed')
console.log('PASS Cash API: rollout/PIN/ownership/fee/expiry gates, insufficient input before provider quote, durable claim before challenge, no repeated signing on timeout/new quote, saved hash before proof, recovery after rollback and expiry, net USDC output.')
record={...record,status:'submitted',metadata:{...record.metadata,txHash:undefined,challengeId:'challenge'}};provider={status:'awaiting_approval'}
assert.equal((await call({action:'cancel',quoteToken:token,circleUserToken:'session'})).data.status,'not_submitted')
assert.equal(record.status,'cancelled')
assert.equal((await call({action:'status',quoteToken:token})).data.status,'not_submitted')
assert.equal((await call({},'GET')).data.pending.length,0)
console.log('PASS Cash conversion: cancelled approval stays out of pending recovery, including after rollout is disabled.')
