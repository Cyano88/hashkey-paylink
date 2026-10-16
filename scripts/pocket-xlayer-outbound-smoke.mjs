import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {encodeAbiParameters,encodeEventTopics,parseAbi,decodeFunctionData,formatUnits} from 'viem'
import {createXLayerOutboundBridge,openOutboundBridge,sealOutboundBridge,outboundBridgeCalls} from '../api/pocket/xlayer-outbound-bridge.ts'
import {validateRelayStablecoinQuote,stablecoinAddress,RELAY_STABLECOIN_CHAINS} from '../api/pocket/xlayer-bridge-provider.ts'
import {createXLayerSponsorshipHandler} from '../api/pocket/xlayer-sponsorship.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='synthetic-outbound-bridge-secret-not-production'
const fixture=JSON.parse(readFileSync('scripts/fixtures/relay-xlayer/USDC-xlayer-base.json','utf8'))
const {input,now}=fixture,hash='0x'+'a'.repeat(64),outHash='0x'+'b'.repeat(64),blockHash='0x'+'c'.repeat(64)
const route=validateRelayStablecoinQuote(fixture.response,input,now)
const transferAbi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const depositAbi=parseAbi(['event RelayErc20Deposit(address from,address token,uint256 amount,bytes32 id)'])
const transfer=(network,from,to,value)=>({address:stablecoinAddress(network,'USDC'),topics:encodeEventTopics({abi:transferAbi,eventName:'Transfer',args:{from,to}}),data:encodeAbiParameters([{type:'uint256'}],[value])})
const depository=RELAY_STABLECOIN_CHAINS.xlayer.depository
const source={status:'success',transactionHash:hash,blockHash,blockNumber:1n,logs:[transfer('xlayer',input.sender,depository,BigInt(input.amountUnits)),transfer('xlayer',input.sender,EVM_PLATFORM_TREASURY,125n),{address:depository,topics:encodeEventTopics({abi:depositAbi,eventName:'RelayErc20Deposit'}),data:encodeAbiParameters([{type:'address'},{type:'address'},{type:'uint256'},{type:'bytes32'}],[input.sender,stablecoinAddress('xlayer','USDC'),BigInt(input.amountUnits),route.orderId])}]}
const destinationReceipt={status:'success',transactionHash:outHash,blockHash,blockNumber:1n,logs:[transfer('base',depository,input.recipient,BigInt(route.receiveUnits))]}
let state={destination:input.recipient,missingDelivery:false,reorg:false,wrongChain:false,quoteUnavailable:false,source:structuredClone(source),delivery:structuredClone(destinationReceipt)}
const status={status:'success',originChainId:196,destinationChainId:8453,inTxHashes:[hash],txHashes:[outHash]}
const requests={requests:[{id:route.requestId,protocol:{orderId:route.orderId,hubType:'onchain'},status:'success',user:input.sender,recipient:input.recipient,data:{inTxs:[{txHash:hash,chainId:196,status:'success'}],outTxs:[{txHash:outHash,chainId:8453,status:'success'}]}}]}
const outbound=createXLayerOutboundBridge({now:()=>now,apiKey:()=>'fixture',destination:async()=>({id:'circlebasewallet',address:state.destination}),route:async i=>{if(state.quoteUnavailable)throw Error('No direct route');assert.deepEqual({...i,sender:i.sender.toLowerCase()},{...input,sender:input.sender.toLowerCase()});return route},client:network=>({getChainId:async()=>state.wrongChain?1:network==='xlayer'?196:8453,getTransactionReceipt:async({hash:h})=>{if(network==='base'&&state.missingDelivery)throw Error('not mined');return network==='xlayer'?state.source:state.delivery},getBlock:async()=>({hash:state.reorg?'0x'+'d'.repeat(64):blockHash})}),fetch:async url=>Response.json(url.includes('/intents/status')?status:requests)})
let estimates=0
const estimate=async i=>{estimates++;assert.equal(i.calls.length,5);return {feeUnits:'100',expiresAt:now+25000,estimateId:'synthetic'}}
const pricing={marginBps:2500,minimumFeeUnits:'0'}
const q=await outbound.quote({ownerId:'owner',walletId:'fixturewallet123',walletAddress:input.sender,asset:'USDC',amount:formatUnits(BigInt(input.amountUnits),6)},estimate,pricing)
const sealed=sealOutboundBridge(q)
assert.deepEqual(openOutboundBridge(sealed,'owner'),q);assert.throws(()=>openOutboundBridge(sealed,'someone-else'))
const calls=outboundBridgeCalls(q),approve=parseAbi(['function approve(address,uint256) returns(bool)'])
assert.deepEqual([calls[0],calls[1],calls[3]].map(c=>decodeFunctionData({abi:approve,data:c.data}).args[1]),[0n,BigInt(input.amountUnits),0n])
for(const change of [{destination:'xlayer'},{orderId:'0x'+'d'.repeat(64)},{destinationAddress:input.sender},{refundOptions:[]},{fee:{...q.fee,networkFeeUnits:'0'}}])assert.throws(()=>sealOutboundBridge({...q,...change}))
await outbound.preflight(q,estimate)
state.destination=input.sender;await assert.rejects(()=>outbound.preflight(q,estimate));state.destination=input.recipient
state.wrongChain=true;await assert.rejects(()=>outbound.preflight(q,estimate));state.wrongChain=false
assert.equal((await outbound.status(q,hash)).status,'completed')
state.source.status='reverted';assert.equal((await outbound.status(q,hash)).status,'failed');state.source=structuredClone(source)
state.source.transactionHash=outHash;assert.equal((await outbound.status(q,hash)).status,'pending');state.source=structuredClone(source)
state.missingDelivery=true;assert.equal((await outbound.status(q,hash)).status,'pending');state.missingDelivery=false
state.reorg=true;assert.equal((await outbound.status(q,hash)).status,'pending');state.reorg=false
state.source.logs.splice(1,1);assert.equal((await outbound.status(q,hash)).status,'needs_attention');state.source=structuredClone(source)
state.delivery.logs=[];assert.equal((await outbound.status(q,hash)).status,'needs_attention');state.delivery=structuredClone(destinationReceipt)
requests.requests[0].recipient=input.sender;assert.equal((await outbound.status(q,hash)).status,'needs_attention');requests.requests[0].recipient=input.recipient

let store, broadcasts=0, sent, enabled=true
const handler=createXLayerSponsorshipHandler({identity:async()=>({userId:'owner'}),user:async()=>({linkedAccounts:[{type:'wallet',walletClientType:'privy',chainType:'ethereum',address:input.sender,id:'fixturewallet123'}]}),config:()=>({appId:'fixture',secret:'synthetic',enabled:true,wallets:[],publicTransfers:true,outboundBridge:enabled}),durable:()=>true,now:()=>now,reimbursement:{estimate,pricing},outbound,read:async()=>structuredClone(store),mutate:async fn=>{store=fn(structuredClone(store));return structuredClone(store)},fetch:async(url,init)=>{broadcasts++;sent=JSON.parse(init.body);return Response.json({data:{hash}})}})
const call=async body=>{const result={status:200};const res={setHeader(){},status(n){result.status=n;return res},json(body){result.body=body;return result}};await handler({method:'POST',body},res);return result}
const quoteRequest={action:'quote',purpose:'bridge',wallet:input.sender,asset:'USDC',amount:formatUnits(BigInt(input.amountUnits),6),destination:'base'}
const quoted=await call(quoteRequest);assert.equal(quoted.status,200,JSON.stringify(quoted.body));assert.equal(broadcasts,0)
const send={action:'send',purpose:'bridge',wallet:input.sender,bridgeQuoteToken:quoted.body.bridgeQuoteToken,request:quoted.body.request,signature:'a'.repeat(88)}
const bad=structuredClone(send);bad.request.body.params.calls.pop();assert.equal((await call(bad)).status,400);assert.equal(broadcasts,0)
assert.equal((await call(send)).body.hash,hash);assert.deepEqual(sent,send.request.body);assert.ok(Object.values(store.requests)[0].bridgeQuoteToken)
assert.equal((await call(send)).body.hash,hash);assert.equal(broadcasts,1)
const capability=await call({action:'bridge-capabilities',wallet:input.sender})
assert.equal(capability.body.enabled,true);assert.equal(capability.body.pending.length,1)
assert.equal(capability.body.pending[0].quote.execution,'privy');assert.equal(capability.body.pending[0].quote.walletAddress.toLowerCase(),input.sender.toLowerCase())
assert.equal(capability.body.pending[0].request,undefined,'recovery must not store authorization signatures')
store.requests.other={...Object.values(store.requests)[0],owner:'someone-else'}
assert.equal((await call({action:'bridge-capabilities',wallet:input.sender})).body.pending.length,1)
enabled=false
assert.equal((await call({action:'bridge-capabilities',wallet:input.sender})).body.enabled,false)
assert.equal((await call({action:'bridge-capabilities',wallet:input.sender})).body.pending.length,1)
assert.equal((await call(quoteRequest)).status,403)
const recovered=await call({action:'status',wallet:input.sender,attemptId:send.request.headers['privy-idempotency-key']})
assert.equal(recovered.body.bridge.status,'completed','recovery remains available when outbound flag is disabled')
console.log('PASS outbound Relay validation, finite approval/reset/deposit plus fee batch, owner/destination binding, exact signed relay, duplicate prevention, persisted recovery, and destination receipt required for success. No funds moved.')
