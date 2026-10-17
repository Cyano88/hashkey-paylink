import assert from 'node:assert/strict'
import {createNativeSendHandler} from '../api/pocket/native-send.ts'
import {quoteNativeSend,sealNativeSend} from '../api/pocket/native-send-quote.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='native-send-api-fixture-secret-'.repeat(3)
const owner='owner-a',address='0x'+'1'.repeat(40),recipient='0x'+'2'.repeat(40),hash='0x'+'a'.repeat(64)
let existing=null,writes=0,allow=true,fee='0.0001',trace=null,provider={status:'pending',txHash:hash},enabled=true,now=Date.now()
const quote=await quoteNativeSend({ownerId:owner,network:'base',walletId:'wallet',walletAddress:address,recipient,amount:'0.01'},async()=>fee,now),token=sealNativeSend(quote)
const d={identity:async()=>({userId:owner}),readLink:async()=>({privyUserId:owner,chain:'base',purpose:'payment',circleWalletId:'wallet',circleWalletAddress:address,circleBlockchain:'BASE'}),enabled:()=>enabled,now:()=>now,approval:async()=>allow,estimate:async()=>fee,find:async()=>existing,list:async()=>existing?[existing]:[],claim:async input=>{if(existing)return{claimed:false,record:existing};existing={...input,status:'started'};return{claimed:true,record:existing}},record:async input=>{existing=input;return input},challenge:async()=>{assert.equal(existing.status,'started');writes++;return{challengeId:'challenge'}},challengeStatus:async()=>provider,rpc:async(network,method)=>({eth_chainId:'0x2105',eth_getBalance:'0x1000000000000000000',eth_getTransactionReceipt:{status:'0x1',blockHash:hash,blockNumber:'0x10',transactionHash:hash},eth_getBlockByNumber:{hash},debug_traceTransaction:trace}[method])}
const handler=createNativeSendHandler(d)
async function call(body,method='POST'){let status=200,data;await handler({method,body,headers:{},query:{}},{setHeader(){},status(s){status=s;return this},json(b){data=b;return this}});return {status,data}}
assert.equal((await call({action:'execute',quoteToken:token})).status,200);assert.equal(writes,1)
assert.equal((await call({action:'execute',quoteToken:token})).data.challengeId,'challenge');assert.equal(writes,1)
// An unrelated successful receipt is insufficient: missing exact native trace never completes.
trace={type:'CALL',calls:[]};assert.equal((await call({action:'status',quoteToken:token,circleUserToken:'session'})).data.status,'pending');assert.equal(existing.status,'submitted')
trace={type:'CALL',to:address,input:quote.callData,calls:[{type:'CALL',from:address,to:recipient,input:'0x',value:'0x'+BigInt(quote.amountUnits).toString(16)},{type:'CALL',from:address,to:EVM_PLATFORM_TREASURY,input:'0x',value:'0x'+BigInt(quote.feeUnits).toString(16)}]}
assert.equal((await call({action:'status',quoteToken:token,circleUserToken:'session'})).data.status,'completed');assert.equal(existing.metadata.txHash,hash)
existing=null;allow=false;assert.equal((await call({action:'execute',quoteToken:token})).status,403);assert.equal(writes,1)
allow=true;fee='0.0002';assert.equal((await call({action:'execute',quoteToken:token})).status,409);assert.equal(existing,null)
fee='0.0001';now+=50000;assert.equal((await call({action:'execute',quoteToken:token})).status,409);assert.equal(writes,1)
now-=50000;enabled=false;assert.equal((await call({action:'execute',quoteToken:token})).status,409)
assert.equal((await call({},'DELETE')).status,405)
// Failed response after provider contact retains the durable claim and never sends twice.
enabled=true;const ambiguous=createNativeSendHandler({...d,challenge:async()=>{writes++;throw Error('timeout')}});let status;const response={setHeader(){},status(s){status=s;return this},json(){return this}};await ambiguous({method:'POST',body:{action:'execute',quoteToken:token},headers:{}},response);assert.equal(status,503);assert.equal(existing.status,'started');await ambiguous({method:'POST',body:{action:'execute',quoteToken:token},headers:{}},response);assert.equal(writes,2)
// Recover a provider-accepted request whose response was lost, without another write.
let lookups=0,rpcReads=0
const recovery=createNativeSendHandler({...d,recoverChallenge:async binding=>{lookups++;assert.equal(binding.refId,'pocket:native-send:'+quote.id);assert.equal(binding.walletId,'wallet');return 'recovered-challenge'},challengeStatus:async input=>{assert.equal(input.challengeId,'recovered-challenge');return {status:'awaiting_approval'}},rpc:async()=>{rpcReads++;throw Error('RPC offline')}})
let recoveredBody
const recoveryResponse={setHeader(){},status(){return this},json(body){recoveredBody=body;return this}}
await recovery({method:'POST',body:{action:'status',quoteToken:token,circleUserToken:'session'},headers:{}},recoveryResponse)
assert.equal(recoveredBody.status,'awaiting_approval');assert.equal(existing.metadata.challengeId,'recovered-challenge');assert.equal(lookups,1);assert.equal(writes,2);assert.equal(rpcReads,0)
await recovery({method:'POST',body:{action:'status',quoteToken:token,circleUserToken:'session'},headers:{}},recoveryResponse)
assert.equal(lookups,1);assert.equal(writes,2)
assert.equal((await call({action:'status',quoteToken:token,circleUserToken:'session'})).data.status,'completed');assert.equal(writes,2)
console.log('PASS native-send API: linked owner, PIN, fee rise/expiry rejection, durable-before-write, timeout recovery without resubmission or RPC, exact trace completion, default gate')
