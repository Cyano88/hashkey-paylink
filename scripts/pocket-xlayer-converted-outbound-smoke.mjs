import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {encodeAbiParameters,encodeEventTopics,encodeFunctionData,decodeFunctionData,parseAbi} from 'viem'
import {getOrderId} from '@relay-protocol/settlement-sdk'
import {createXLayerOutboundBridge,outboundBridgeCalls,outboundBridgePreview,sealOutboundBridge,openOutboundBridge} from '../api/pocket/xlayer-outbound-bridge.ts'
import {validateRelayStablecoinQuote,relayStablecoinRequest,stablecoinAddress,RELAY_STABLECOIN_CHAINS} from '../api/pocket/xlayer-bridge-provider.ts'
import {xlayerBridgeSourceProven,xlayerBridgeDeliveryCandidate,xlayerBridgeDeliveryProven} from '../api/pocket/xlayer-bridge-evidence.ts'
import {validateOutboundBridge} from '../src/pocket/api/pocketOutboundBridge.ts'
import {makeSponsoredBatchRequest} from '../src/pocket/lib/pocketSponsoredRequest.ts'
import {validateXLayerBridgeSwap} from '../src/pocket/lib/pocketXStocksSwap.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
const q=JSON.parse(readFileSync('scripts/fixtures/relay-xlayer/USDT-converted-outbound.json','utf8')),now=q.fee.issuedAt,owner=q.fee.walletAddress,dest=q.destinationAddress
process.env.POCKET_SWAP_QUOTE_SECRET='synthetic-conversion-secret-not-production'
const calls=outboundBridgeCalls(q),quote=outboundBridgePreview(q)
assert.equal(calls.length,8)
validateXLayerBridgeSwap(q.conversion.swap,owner,now)
assert.throws(()=>validateXLayerBridgeSwap(q.conversion.swap,dest,now),'Bridge conversion remains bound to its owner')
const review={quote,quoteToken:'fixture',request:makeSponsoredBatchRequest({appId:'fixture',walletId:'fixturewallet123',attemptId:quote.id,expiresAt:quote.expiresAt,calls:q.fee.calls})}
validateOutboundBridge(review,owner,dest,'USDT','1',now)
assert.deepEqual(openOutboundBridge(sealOutboundBridge(q),q.fee.ownerId),q)
const approve=parseAbi(['function approve(address,uint256) returns(bool)'])
assert.deepEqual([0,1,3,4,5,7].map(n=>decodeFunctionData({abi:approve,data:calls[n].data}).args[1]),[0n,1000000n,0n,0n,BigInt(q.conversion.depositUnits),0n])
for(const mutate of [r=>r.quote.conversion.depositUnits='1000001',r=>r.quote.conversion.swap.tx.to=dest,r=>r.quote.conversion.swap.owner=dest,r=>r.quote.conversion.swap.tx.data='0xdeadbeef',r=>r.quote.conversion.swap.minimumOutUnits='1',r=>r.quote.refundOptions[0].asset='USDT',r=>r.quote.refundOptions[0].recipient=dest,r=>r.request.body.params.calls.splice(3,1),r=>r.request.body.params.calls[8].to=dest,r=>r.quote.conversion=undefined]){const r=structuredClone(review);mutate(r);assert.throws(()=>validateOutboundBridge(r,owner,dest,'USDT','1',now))}
assert.throws(()=>validateOutboundBridge(review,owner,dest,'USDT','1',q.fee.expiresAt+1))
const depositAbi=parseAbi(['event RelayErc20Deposit(address from,address token,uint256 amount,bytes32 id)']),transferAbi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const depository=RELAY_STABLECOIN_CHAINS.xlayer.depository,hash='0x'+'a'.repeat(64),outHash='0x'+'b'.repeat(64)
const transfer=(asset,from,to,units)=>({address:stablecoinAddress('xlayer',asset),topics:encodeEventTopics({abi:transferAbi,eventName:'Transfer',args:{from,to}}),data:encodeAbiParameters([{type:'uint256'}],[BigInt(units)])})
const binding={asset:'USDT',source:'xlayer',destination:'base',sender:owner,recipient:dest,amountUnits:q.fee.amountUnits,depositAsset:'USDC',depositUnits:q.conversion.depositUnits,orderId:q.orderId,requestId:q.requestId,minimumUnits:q.minimumUnits,networkFeeUnits:q.fee.networkFeeUnits,reimbursementTreasury:EVM_PLATFORM_TREASURY,refundOptions:q.refundOptions}
const receipt={status:'success',transactionHash:hash,logs:[transfer('USDT',owner,q.conversion.swap.tx.to,q.fee.amountUnits),transfer('USDT',owner,EVM_PLATFORM_TREASURY,q.fee.networkFeeUnits),transfer('USDC',q.conversion.swap.tx.to,owner,BigInt(q.conversion.depositUnits)+2000n),transfer('USDC',owner,depository,q.conversion.depositUnits),{address:depository,topics:encodeEventTopics({abi:depositAbi,eventName:'RelayErc20Deposit'}),data:encodeAbiParameters([{type:'address'},{type:'address'},{type:'uint256'},{type:'bytes32'}],[owner,stablecoinAddress('xlayer','USDC'),BigInt(q.conversion.depositUnits),q.orderId])}]}
assert(xlayerBridgeSourceProven(binding,receipt,hash))
for(const mutate of [r=>r.logs.splice(1,1),r=>r.logs.splice(2,1),r=>r.logs[1]=transfer('USDT',owner,dest,q.fee.networkFeeUnits),r=>r.logs.at(-1).address=dest]){const r=structuredClone(receipt);mutate(r);assert.equal(xlayerBridgeSourceProven(binding,r,hash),false)}
assert.equal(xlayerBridgeSourceProven({...binding,depositUnits:'1'},receipt,hash),false)
const status={status:'refund',originChainId:196,inTxHashes:[hash],txHashes:[outHash]}
const requests={requests:[{id:q.requestId,protocol:{hubType:'onchain',orderId:q.orderId},status:'refund',user:owner,recipient:dest,data:{inTxs:[{txHash:hash,chainId:196,status:'success'}],outTxs:[{txHash:outHash,chainId:196,status:'success'}],refundCurrencyData:{currency:{chainId:196,address:stablecoinAddress('xlayer','USDC'),decimals:6},amount:'900000'}}}]}
const candidate=xlayerBridgeDeliveryCandidate(binding,hash,status,requests)
assert.equal(candidate.status,'verify_delivery');assert.equal(candidate.asset,'USDC');assert.equal(candidate.recipient,owner);assert(xlayerBridgeDeliveryProven(candidate,900000n));assert(!xlayerBridgeDeliveryProven(candidate,899999n))
assert.equal(xlayerBridgeDeliveryCandidate({...binding,depositAsset:undefined,depositUnits:undefined},hash,status,requests).status,'needs_attention')
// A converted bridge still requires a normal, exact USDC deposit order; it may
// not import arbitrary Relay origin swaps or change the destination asset.
const fixture=JSON.parse(readFileSync('scripts/fixtures/relay-xlayer/USDC-xlayer-base.json','utf8')),i={...fixture.input,asset:'USDT',inputAsset:'USDC'},raw=structuredClone(fixture.response)
raw.protocol.v2.orderData.output.payments[0].currency=stablecoinAddress('base','USDT')
raw.protocol.v2.orderData.output.payments[0].minimumAmount=((BigInt(raw.protocol.v2.orderData.output.payments[0].expectedAmount)*9976n+9999n)/10000n).toString()
raw.protocol.v2.orderData.inputs[0].refunds.find(r=>r.chainId==='base').currency=stablecoinAddress('base','USDT')
raw.details.currencyOut.currency.address=stablecoinAddress('base','USDT')
raw.protocol.v2.orderId=getOrderId(raw.protocol.v2.orderData,{xlayer:'ethereum-vm',base:'ethereum-vm'})
raw.steps.find(s=>s.id==='deposit').items[0].data.data=encodeFunctionData({abi:parseAbi(['function depositErc20(address,address,uint256,bytes32)']),functionName:'depositErc20',args:[i.sender,stablecoinAddress('xlayer','USDC'),BigInt(i.amountUnits),raw.protocol.v2.orderId]})
const route=validateRelayStablecoinQuote(raw,i,fixture.now)
const widened=structuredClone(raw);widened.protocol.v2.orderData.output.payments[0].minimumAmount=(BigInt(widened.protocol.v2.orderData.output.payments[0].expectedAmount)*9950n/10000n).toString();assert.throws(()=>validateRelayStablecoinQuote(widened,i,fixture.now),/slippage/)
assert.equal(route.refundOptions.find(r=>r.network==='xlayer').asset,'USDC');assert.equal(relayStablecoinRequest(i).disableOriginSwaps,true)
assert.throws(()=>validateRelayStablecoinQuote(raw,{...i,inputAsset:undefined},fixture.now))
assert.throws(()=>relayStablecoinRequest({...i,source:'base',destination:'xlayer'}))
let estimated=0
const backend=createXLayerOutboundBridge({now:()=>now,client:network=>({readContract:async()=>1000000000n,getChainId:async()=>network==='xlayer'?196:8453}),destination:async()=>({id:q.destinationWalletId,address:dest}),convert:async()=>q.conversion.swap,route:async input=>{assert.equal(input.inputAsset,'USDC');assert.equal(input.amountUnits,q.conversion.depositUnits);return {source:'xlayer',destination:'base',asset:'USDT',amountUnits:input.amountUnits,execution:{kind:'evm'},orderId:q.orderId,requestId:q.requestId,receiveUnits:q.receiveUnits,minimumUnits:q.minimumUnits,refundOptions:q.refundOptions,expiresAt:now+30000}}})
const result=await backend.quote({ownerId:'fixture',walletId:'fixturewallet123',walletAddress:owner,asset:'USDT',amount:'1'},async input=>{estimated++;assert.equal(input.calls.length,9);return {feeUnits:'285',expiresAt:now+25000,estimateId:'fixture'}},{marginBps:2500,minimumFeeUnits:'10000'})
assert(estimated>=2);assert.equal(result.fee.totalUnits,'1010000');assert.deepEqual(result.conversion,q.conversion)
console.log('PASS converted USDT: bounded atomic swap/deposit/reset batch; full fee estimate; client/server binding; tampering rejected; existing USDC protected; exact USDC refund evidence; Trade remains unchanged. No funds moved.')
