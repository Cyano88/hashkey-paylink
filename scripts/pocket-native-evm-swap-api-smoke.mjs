import assert from 'node:assert/strict'
import {fixture,owner,wallet,hash} from './fixtures/native-evm-swap.mjs'
import {sealNativeEvmSwap} from '../api/pocket/native-evm-swap-quote.ts'
import {createNativeEvmSwapHandler,nativeSwapReview} from '../api/pocket/native-evm-swap.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='native-swap-api-fixture-'.repeat(3)
const {q,trace,now}=await fixture('base',true),token=sealNativeEvmSwap(q)
let record=null,writes=0,approve=true,fee='0.00001',enabled=true,rpcDown=false,provider={status:'pending',txHash:hash},clock=now,proof=trace
const d={identity:async()=>({userId:owner}),readLink:async()=>({privyUserId:owner,chain:'base',purpose:'payment',circleBlockchain:'BASE',circleWalletId:'wallet',circleWalletAddress:wallet}),enabled:()=>enabled,now:()=>clock,approval:async()=>approve,estimate:async()=>fee,quote:async()=>q,list:async()=>record?[record]:[],find:async()=>record,claim:async input=>{if(record)return{claimed:false,record};record={...input,status:'started'};return{claimed:true,record}},record:async input=>{record=input;return input},challenge:async()=>{assert.equal(record.status,'started');writes++;throw Error('timeout')},recoverChallenge:async binding=>{assert.equal(binding.refId,'pocket:native-swap:'+q.id);return 'recovered'},challengeStatus:async()=>provider,rpc:async(_network,method)=>{if(rpcDown)throw Error('offline');return {eth_chainId:'0x2105',eth_call:'0x10000000',eth_getTransactionReceipt:{status:'0x1',blockHash:hash,transactionHash:hash,blockNumber:'0x10'},eth_getBlockByNumber:{hash},debug_traceTransaction:proof}[method]}}
const handler=createNativeEvmSwapHandler(d)
async function call(body,method='POST'){let status=200,data;await handler({method,body,headers:{}},{setHeader(){},status(s){status=s;return this},json(b){data=b;return this}});return{status,data}}
assert.equal(nativeSwapReview(q).feeFromOutput,true);assert.equal(nativeSwapReview(q).minimumOut,'0.00098')
enabled=false;assert.equal((await call({action:'execute',quoteToken:token})).status,409);enabled=true
approve=false;assert.equal((await call({action:'execute',quoteToken:token})).status,403);approve=true
fee='0.01';assert.equal((await call({action:'execute',quoteToken:token})).status,409);fee='0.00001';assert.equal(record,null)
clock+=50000;assert.equal((await call({action:'execute',quoteToken:token})).status,409);clock=now
assert.equal((await call({action:'execute',quoteToken:token})).status,503);assert.equal(writes,1);assert.equal(record.status,'started')
await call({action:'execute',quoteToken:token});assert.equal(writes,1)
provider={status:'awaiting_approval'};rpcDown=true;assert.equal((await call({action:'status',quoteToken:token,circleUserToken:'session'})).data.status,'awaiting_approval');assert.equal(record.metadata.challengeId,'recovered')
provider={status:'pending',txHash:hash};assert.equal((await call({action:'status',quoteToken:token,circleUserToken:'session'})).status,503);assert.equal(record.metadata.txHash,hash)
rpcDown=false;proof={type:'CALL'};assert.equal((await call({action:'status',quoteToken:token})).data.status,'pending');proof=trace
const done=await call({action:'status',quoteToken:token});assert.equal(done.data.status,'completed');assert.equal(done.data.amountOut,'0.000985');assert.equal(writes,1)
enabled=false;assert.equal((await call({action:'status',quoteToken:token})).data.status,'completed')
console.log('PASS swap API: gate/PIN/fee/expiry, durable timeout claim, no repeat challenge, recovery during RPC outage, saved hash before proof, exact output confirmation without auth token, net review amount')
