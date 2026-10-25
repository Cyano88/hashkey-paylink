import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {encodeAbiParameters,encodeEventTopics,parseAbi,parseAbiParameters} from 'viem'
import {createBscInboundBridgeHandler} from '../api/pocket/bsc-inbound-bridge.ts'
import {validateBscRelayQuote,bscBridgeTokenAddress,RELAY_BSC_CHAINS} from '../api/pocket/bsc-bridge-provider.ts'
import {quoteEvmBridgeFee} from '../api/pocket/evm-bridge-reimbursement.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='synthetic-bsc-bridge-secret-not-production-12345'
const response=JSON.parse(readFileSync('scripts/fixtures/bsc-bridge/usdc-in.json','utf8'));const fixture={response,now:response.protocol.v2.orderData.output.deadline*1000-7*86400000,input:{asset:'USDC',source:'base',destination:'bsc',sender:'0xd7579fa0784288ef6eab335bc97d3c8ebc7ec435',recipient:'0xd7579fa0784288ef6eab335bc97d3c8ebc7ec435',amountUnits:'10000000'}}
const route=validateBscRelayQuote(fixture.response,fixture.input,fixture.now)
const owner='owner',walletId='wallet',sender=fixture.input.sender,recipient=fixture.input.recipient
const sourceHash='0x'+'a'.repeat(64),destHash='0x'+'b'.repeat(64),blockHash='0x'+'c'.repeat(64)
const transfer=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const deposit=parseAbi(['event RelayErc20Deposit(address from,address token,uint256 amount,bytes32 id)'])
const log=(network,from,to,units)=>({address:bscBridgeTokenAddress(network,'USDC'),data:encodeAbiParameters(parseAbiParameters('uint256'),[units]),topics:encodeEventTopics({abi:transfer,eventName:'Transfer',args:{from,to}})})
function harness(){
 const records=new Map(),receipts=new Map();let sends=0,ledger=0,lost=false,identity=owner,changed=false,enabled=true,canonical=true,providerStatus='pending'
 const chainIds={base:8453,bsc:56}
 const rpc=network=>({getChainId:async()=>chainIds[network],readContract:async()=>1000000000n,call:async()=>{},getBlockNumber:async()=>100n,getBlock:async()=>({hash:canonical?blockHash:sourceHash}),getTransactionReceipt:async({hash})=>{if(!receipts.has(hash))throw Error('not found');return receipts.get(hash)}})
 const handler=createBscInboundBridgeHandler({identity:async()=>({userId:identity}),wallets:async()=>({walletId,walletAddress:sender,destinationAddress:changed?'0x'+'9'.repeat(40):recipient}),now:()=>fixture.now,enabled:async()=>enabled,apiKey:()=> 'synthetic',client:rpc,
 quote:async input=>{assert.equal(input.sender,sender);assert.equal(input.recipient,recipient);return route},
 price:input=>quoteEvmBridgeFee(input,async()=> '0.000001',3000n*100000000n,fixture.now),
 find:async(_owner,key)=>records.get(key)||null,list:async()=>[...records.values()],
 claim:async input=>{if([...records.values()].some(r=>['started','submitted'].includes(r.status)))return {claimed:false};records.set(input.idempotencyKey,{...input,id:'journal',status:'started',createdAt:fixture.now,updatedAt:fixture.now});return {claimed:true}},
 record:async input=>{const r={...records.get(input.idempotencyKey),...input,updatedAt:fixture.now};records.set(input.idempotencyKey,r);return r},
 challenge:async()=>{sends++;if(lost)throw Error('lost response');return {challengeId:'challenge'}},readChallenge:async()=>({status:'awaiting_approval'}),activity:async()=>[],ledger:async()=>{ledger++},
 fetch:async url=>({ok:true,json:async()=>url.includes('/intents/')?{status:providerStatus,originChainId:8453,destinationChainId:56,inTxHashes:[sourceHash],txHashes:[destHash]}:{requests:[{id:route.requestId,protocol:{orderId:route.orderId,hubType:'onchain'},status:providerStatus,user:sender,recipient,data:{inTxs:[{txHash:sourceHash,chainId:8453,status:'success'}],outTxs:[{txHash:destHash,chainId:56,status:'success'}]}}]}})})
 const request=async(body,method='POST')=>{let code=200,result;await handler({method,body},{setHeader(){},status(value){code=value;return this},json(value){result=value;return this}});return {code,...result}}
 return {request,records,receipts,chainIds,get sends(){return sends},get ledger(){return ledger},set lost(v){lost=v},set identity(v){identity=v},set changed(v){changed=v},set enabled(v){enabled=v},set canonical(v){canonical=v},set providerStatus(v){providerStatus=v}}
}
const quoteBody={action:'quote',source:'base',destination:'bsc',amount:'10',circleUserToken:'synthetic'}
const h=harness(),quoted=await h.request(quoteBody)
assert.equal(quoted.code,200);assert.equal(quoted.quote.asset,'USDC');assert.equal(quoted.quote.networkFeeUnits,'3000');assert.equal(quoted.quote.total,'10.003');assert.equal(quoted.quote.callData,undefined)
const execute={action:'execute',quoteToken:quoted.quoteToken,circleUserToken:'synthetic'}
for(const [network,testnet] of [['base',84532],['bsc',1952]]){
 const wrong=harness();wrong.chainIds[network]=testnet
 assert.equal((await wrong.request(quoteBody)).code,503,'wrong network cannot quote')
 assert.equal(wrong.sends,0)
 const switched=harness(),approved=await switched.request(quoteBody)
 switched.chainIds[network]=testnet
 assert.equal((await switched.request({...execute,quoteToken:approved.quoteToken})).code,503,'network change after quote cannot submit')
 assert.equal(switched.sends,0);assert.equal(switched.records.size,0)
}
assert.notEqual((await h.request({...execute,quoteToken:quoted.quoteToken+'x'})).code,200)
assert.equal((await h.request({...quoteBody,asset:'USDT'})).code,409)
for(const source of ['bsc','unknown'])assert.equal((await h.request({...quoteBody,source})).code,409)
h.identity='other';assert.notEqual((await h.request(execute)).code,200);assert.equal(h.sends,0);h.identity=owner
h.changed=true;assert.equal((await h.request(execute)).code,409);h.changed=false
await Promise.all([h.request(execute),h.request(execute)]);assert.equal(h.sends,1,'concurrent submission creates one challenge')
assert.equal((await h.request(execute)).challengeId,'challenge');assert.equal(h.sends,1)
const status={...execute,action:'status'}
assert.equal((await h.request(status)).status,'awaiting_approval','approval is not completed bridging')
assert.equal((await h.request({...status,action:'cancel'})).status,'cancelled')
assert.equal([...h.records.values()][0].metadata.approvalCancelled,'true','Verified cancellation is hidden durably, without declaring an unsubmitted challenge settled')
const depositLog={address:RELAY_BSC_CHAINS.base.depository,data:encodeAbiParameters(parseAbiParameters('address,address,uint256,bytes32'),[sender,bscBridgeTokenAddress('base','USDC'),10000000n,route.orderId]),topics:encodeEventTopics({abi:deposit,eventName:'RelayErc20Deposit'})}
const sourceReceipt={status:'success',transactionHash:sourceHash,blockNumber:1n,blockHash,logs:[log('base',sender,RELAY_BSC_CHAINS.base.depository,10000000n),depositLog,log('base',sender,EVM_PLATFORM_TREASURY,3000n)]}
h.receipts.set(sourceHash,sourceReceipt);h.providerStatus='success'
assert.equal((await h.request({...status,txHash:sourceHash})).status,'pending','provider success without receipt is pending')
assert.equal(h.ledger,0)
h.receipts.set(destHash,{status:'success',transactionHash:destHash,blockNumber:2n,blockHash,logs:[log('bsc','0x'+'3'.repeat(40),recipient,BigInt(route.minimumUnits)-1n)]})
assert.equal((await h.request(status)).status,'needs_attention','insufficient delivery must not complete')
h.receipts.get(destHash).logs=[log('bsc','0x'+'3'.repeat(40),recipient,BigInt(route.receiveUnits))]
h.canonical=false;assert.equal((await h.request(status)).status,'pending');h.canonical=true
h.enabled=false;assert.equal((await h.request(quoteBody)).code,409);assert.equal((await h.request(status)).status,'completed','disabled rollout still recovers existing bridge')
assert.equal(h.sends,1);assert.equal(h.ledger,1)
assert.equal((await h.request(status)).status,'completed');assert.equal(h.ledger,2,'terminal reads repair the ledger write gap idempotently')
const lost=harness(),lostQuote=await lost.request(quoteBody);lost.lost=true
const lostExecute={...execute,quoteToken:lostQuote.quoteToken}
assert.equal((await lost.request(lostExecute)).code,503);assert.equal((await lost.request(lostExecute)).code,409);assert.equal(lost.sends,1)
const fee=harness(),feeQuote=await fee.request(quoteBody);await fee.request({...execute,quoteToken:feeQuote.quoteToken})
fee.receipts.set(sourceHash,{...sourceReceipt,logs:sourceReceipt.logs.slice(0,2)})
assert.equal((await fee.request({action:'status',quoteToken:feeQuote.quoteToken,txHash:sourceHash})).status,'needs_attention','missing fee reimbursement fails proof')
assert.equal(fee.ledger,0)
console.log('PASS Base to BNB Chain handler: owned wallets, signed quote, exact fee, duplicate/lost-response protection, canonical source and delivery proofs, recovery while disabled, and terminal ledger repair. Synthetic only; no funds moved.')
