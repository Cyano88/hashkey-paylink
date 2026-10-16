import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {encodeAbiParameters,encodeEventTopics,parseAbi,parseAbiParameters} from 'viem'
import {validateRelayStablecoinQuote,stablecoinAddress,relayStablecoinRequest} from '../api/pocket/xlayer-bridge-provider.ts'
import {xlayerBridgeDeliveryCandidate,xlayerBridgeDeliveryProven,evmStablecoinDelta} from '../api/pocket/xlayer-bridge-evidence.ts'

const f=JSON.parse(readFileSync('scripts/fixtures/relay-xlayer/USDT-base-xlayer.json','utf8'))
const inspect=q=>validateRelayStablecoinQuote(q,f.input,f.now,{allowXLayerUsdcRefund:true})
assert.throws(()=>validateRelayStablecoinQuote(f.response,f.input,f.now),/refund mismatch/,'normal production quote path remains closed')
const route=inspect(f.response)
assert.equal(relayStablecoinRequest(f.input).slippageTolerance,'49')
const excessSlippage=structuredClone(f.response)
excessSlippage.protocol.v2.orderData.output.payments[0].minimumAmount=(BigInt(excessSlippage.protocol.v2.orderData.output.payments[0].expectedAmount)*9950n/10000n-2n).toString()
assert.throws(()=>inspect(excessSlippage),/slippage limits/,'request adjustment must not relax the acceptance bound')
assert.deepEqual(route.refundOptions,[{network:'base',asset:'USDT',recipient:f.input.sender},{network:'xlayer',asset:'USDC',recipient:f.input.recipient}])
for(const mutate of [
 q=>q.protocol.v2.orderData.inputs[0].refunds[0].currency=stablecoinAddress('base','USDC'),
 q=>q.protocol.v2.orderData.inputs[0].refunds[1].currency=f.input.sender,
 q=>q.protocol.v2.orderData.inputs[0].refunds[1].recipient=f.input.sender,
 q=>q.protocol.v2.orderData.inputs[0].refunds[1].chainId='arbitrum',
 q=>q.protocol.v2.orderData.inputs[0].refunds[1].minimumAmount='1',
 q=>q.protocol.v2.orderData.inputs[0].refunds[1].deadline++,
 q=>q.protocol.v2.orderId='0x'+'0'.repeat(64),
 q=>q.protocol.v2.orderData.inputs[0].payment.currency=stablecoinAddress('base','USDC'),
]) {const copy=structuredClone(f.response);mutate(copy);assert.throws(()=>inspect(copy))}
const outbound=JSON.parse(readFileSync('scripts/fixtures/relay-xlayer/USDT-xlayer-base.json','utf8'))
assert.throws(()=>validateRelayStablecoinQuote(outbound.response,outbound.input,outbound.now,{allowXLayerUsdcRefund:true}),/input payment mismatch/,'opt-in never permits origin conversions')

const hash='0x'+'a'.repeat(64),outHash='0x'+'b'.repeat(64)
const binding={...f.input,orderId:route.orderId,requestId:route.requestId,minimumUnits:route.minimumUnits,refundOptions:route.refundOptions}
const status={status:'refund',originChainId:8453,destinationChainId:196,inTxHashes:[hash],txHashes:[outHash]}
const requests={requests:[{id:route.requestId,protocol:{orderId:route.orderId,hubType:'onchain'},status:'refund',user:f.input.sender,recipient:f.input.recipient,data:{inTxs:[{txHash:hash,chainId:8453,status:'success'}],outTxs:[{txHash:outHash,chainId:196,status:'success'}],refundCurrencyData:{currency:{chainId:196,address:stablecoinAddress('xlayer','USDC'),decimals:6},amount:'9800000'}}}]}
const candidate=xlayerBridgeDeliveryCandidate(binding,hash,status,requests)
assert.equal(candidate.status,'verify_delivery');assert.equal(candidate.asset,'USDC');assert.equal(candidate.network,'xlayer');assert.equal(candidate.recipient,f.input.recipient)
assert.equal(xlayerBridgeDeliveryCandidate({...binding,refundOptions:undefined},hash,status,requests).status,'needs_attention','status alone cannot authorize alternate asset')
for(const plan of [[],[route.refundOptions[0],route.refundOptions[0]],[{...route.refundOptions[0],asset:'USDC'},route.refundOptions[1]],[route.refundOptions[0],{...route.refundOptions[1],recipient:f.input.sender}],[route.refundOptions[0],{...route.refundOptions[1],asset:'USDT'}]]) {
 assert.equal(xlayerBridgeDeliveryCandidate({...binding,refundOptions:plan},hash,status,requests).status,'needs_attention')
}
const abi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const receipt={status:'success',transactionHash:outHash,logs:[{address:stablecoinAddress('xlayer','USDC'),topics:encodeEventTopics({abi,eventName:'Transfer',args:{from:f.input.sender,to:f.input.recipient}}),data:encodeAbiParameters(parseAbiParameters('uint256'),[9800000n])}]}
assert.equal(xlayerBridgeDeliveryProven(candidate,evmStablecoinDelta(receipt,candidate.network,candidate.asset,candidate.recipient,candidate.hash)),true)
assert.equal(xlayerBridgeDeliveryProven(candidate,evmStablecoinDelta(receipt,'xlayer','USDT',candidate.recipient,candidate.hash)),false,'USDC refund cannot be reported as USDT')
assert.equal(xlayerBridgeDeliveryProven(candidate,9800001n),false)
assert.equal(xlayerBridgeDeliveryProven(candidate,null),false)
const success={...status,status:'success'},delivered=structuredClone(requests)
delivered.requests[0].status='success'
assert.equal(xlayerBridgeDeliveryCandidate(binding,hash,success,delivered).asset,'USDT','successful delivery still requires USDT')
const original=structuredClone(requests)
original.requests[0].data.refundCurrencyData={currency:{chainId:8453,address:stablecoinAddress('base','USDT'),decimals:6},amount:'9800000'}
original.requests[0].data.outTxs[0].chainId=8453
const returned=xlayerBridgeDeliveryCandidate(binding,hash,status,original)
assert.equal(returned.status,'verify_delivery');assert.equal(returned.asset,'USDT');assert.equal(returned.recipient,f.input.sender)
console.log('PASS inbound USDT refund plan: explicit opt-in, exact wallets/tokens/order, no origin conversion, USDC destination refund proof, USDT source refund and delivery. Production route remains disabled. No funds moved.')
