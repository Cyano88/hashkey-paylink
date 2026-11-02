import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {getOrderId} from '@relay-protocol/settlement-sdk'
import {encodeFunctionData,decodeFunctionData,parseAbi} from 'viem'
import {CROSS_BRIDGE_NETWORKS,crossBridgeAssets,crossBridgePair} from '../src/pocket/lib/pocketCrossBridgeAssets.ts'
import {crossBridgeRelayRequest,validateCrossBridgeRelayQuote,crossBridgeDepositAbi,quoteCrossBridgeRelay} from '../api/pocket/cross-bridge-provider.ts'
import {RELAY_BSC_CHAINS,bscRelaySolanaDeposit} from '../api/pocket/bsc-bridge-provider.ts'
import {fixture,now,evm,sol} from './fixtures/cross-bridge.mjs'
let routes=0
for(const source of CROSS_BRIDGE_NETWORKS)for(const destination of CROSS_BRIDGE_NETWORKS){if(source===destination)continue
 for(const from of crossBridgeAssets(source))for(const to of crossBridgeAssets(destination)){
  const {q,i}=fixture(source,destination,from.symbol,to.symbol),result=validateCrossBridgeRelayQuote(q,i,now),request=crossBridgeRelayRequest(i)
  assert.equal(result.tokenIn.decimals,from.decimals);assert.equal(result.tokenOut.decimals,to.decimals)
  assert.equal(request.destinationCurrency,to.address);assert.equal(result.execution.kind,source==='solana'?'solana':'evm')
  if(result.execution.kind==='evm'){assert.equal(result.execution.calls.length,from.native?1:4);assert.equal(result.execution.calls.find(c=>c.target===RELAY_BSC_CHAINS[source].depository).value,from.native?BigInt(i.amountUnits):0n)}
  routes++
 }
}
for(const network of CROSS_BRIDGE_NETWORKS)for(const symbol of ['SOL','POL','WSOL','WPOL'])assert.throws(()=>crossBridgePair(network,network==='base'?'polygon':'base',symbol,'USDC'))
for(const network of ['polygon','solana'])for(const symbol of ['USDC','USDT'])assert.doesNotThrow(()=>crossBridgePair('base',network,'ETH',symbol))
assert.throws(()=>crossBridgePair('base','base','ETH','USDC'))
assert.throws(()=>crossBridgePair('base','arc','USDC','USDT'))
assert.throws(()=>crossBridgePair('base','solana','ETH','SOL'))
for(const [source,destination,from,to] of [['base','polygon','ETH','USDT'],['bsc','xlayer','USDC','USDG'],['solana','base','USDT','ETH']]){
 const {q,i}=fixture(source,destination,from,to,true)
 const result=validateCrossBridgeRelayQuote(q,i,now)
 assert.equal(result.refundOptions[1].asset,'USDC')
 const mutate=fn=>{const bad=structuredClone(q);fn(bad);assert.throws(()=>validateCrossBridgeRelayQuote(bad,i,now))}
 mutate(v=>v.protocol.v2.orderData.output.payments[0].recipient=evm==='no'?sol:'0x'+'2'.repeat(40))
 mutate(v=>v.protocol.v2.orderData.inputs[0].payment.amount='1')
 mutate(v=>v.protocol.v2.orderData.inputs[0].refunds[1].recipient='0x'+'2'.repeat(40))
 mutate(v=>v.protocol.v2.orderData.inputs[0].refunds[1].currency='0x'+'2'.repeat(40))
 mutate(v=>v.protocol.v2.paymentDetails.depository='0x'+'2'.repeat(40))
 mutate(v=>v.protocol.v2.orderData.output.payments[0].minimumAmount='1')
 mutate(v=>v.protocol.v2.orderId='0x'+'0'.repeat(64))
 mutate(v=>v.details.currencyOut.currency.decimals=7)
 mutate(v=>v.steps[0].items[0].check.endpoint='/other')
 mutate(v=>v.steps[0].id='sign')
 mutate(v=>v.protocol.v2.orderData.output.calls=[{}])
 mutate(v=>v.fees.app.amount='1')
 if(source==='solana')mutate(v=>v.steps[0].items[0].data.instructions[0].keys[1].isSigner=false)
 else {mutate(v=>v.steps[0].items[0].data.value='1');mutate(v=>v.steps[0].items[0].data.data+='00');mutate(v=>v.steps[0].items[0].data.from='0x'+'2'.repeat(40))}
}
// Current recorded BNB stablecoin routes retain their exact deposit plans.
for(const asset of ['USDC','USDT'])for(const direction of ['in','out']){
 const q=JSON.parse(readFileSync(new URL(`./fixtures/bsc-bridge/${asset.toLowerCase()}-${direction}.json`,import.meta.url),'utf8'))
 const i={source:direction==='in'?'base':'bsc',destination:direction==='in'?'bsc':'base',from:asset,to:asset,sender:evm,recipient:evm,amountUnits:direction==='in'?'10000000':'10000000000000000000'}
 assert.equal(validateCrossBridgeRelayQuote(q,i,q.protocol.v2.orderData.output.deadline*1000-7*86400000).execution.kind,'evm')
}
console.log(`PASS ${routes} eligible cross-network asset pairs; native SOL/POL rejected; ETH -> Polygon/Solana stables allowed; native values, decimals, refunds, slippage, order hashes and tampered plans checked. Fixtures only; no execution.`)
import {changeCrossBridgeNetwork,changeCrossBridgeAsset,reverseCrossBridgeSelection,crossBridgeSelectionKey} from '../src/pocket/lib/pocketCrossBridgeSelection.ts'
const selected={source:'base',destination:'polygon',from:'ETH',to:'USDT'}
assert.deepEqual(changeCrossBridgeNetwork(selected,'destination','solana'),{...selected,destination:'solana'})
assert.deepEqual(changeCrossBridgeNetwork(selected,'source','solana'),{...selected,source:'solana',from:'USDC'})
assert.deepEqual(changeCrossBridgeNetwork(selected,'destination','arc'),{...selected,destination:'arc',to:'USDC'})
assert.throws(()=>changeCrossBridgeNetwork(selected,'source','polygon'))
assert.throws(()=>changeCrossBridgeAsset(selected,'to','POL'))
assert.equal(crossBridgeSelectionKey(selected),'base:ETH:polygon:USDT')
assert.deepEqual(reverseCrossBridgeSelection(reverseCrossBridgeSelection(selected)),selected)
console.log('PASS independent network/token selection, unsupported-token fallback, same-network rejection and reversible route identity')
const native=fixture('base','polygon','ETH','USDT')
native.q.steps[0].items[0].data.data=encodeFunctionData({abi:crossBridgeDepositAbi,functionName:'depositNative',args:['0x'+'0'.repeat(40),native.q.protocol.v2.orderId]})
assert.equal(validateCrossBridgeRelayQuote(native.q,native.i,now).execution.calls.length,1,'zero depositor convention is reconstructed as the bound sender')
const approved=JSON.parse(readFileSync(new URL('./fixtures/bsc-bridge/usdc-out.json',import.meta.url),'utf8'))
const approvalInput={source:'bsc',destination:'base',from:'USDC',to:'USDC',sender:evm,recipient:evm,amountUnits:'10000000000000000000'},approvalNow=approved.protocol.v2.orderData.output.deadline*1000-7*86400000
const approvalAbi=parseAbi(['function approve(address spender,uint256 amount) returns(bool)'])
for(const patch of [tx=>tx.data+='00',tx=>tx.data=encodeFunctionData({abi:approvalAbi,functionName:'approve',args:[evm,10000000000000000000n]}),tx=>tx.data=encodeFunctionData({abi:approvalAbi,functionName:'approve',args:[RELAY_BSC_CHAINS.bsc.depository,2n**256n-1n]})]){const bad=structuredClone(approved);patch(bad.steps.find(s=>s.id==='approve').items[0].data);assert.throws(()=>validateCrossBridgeRelayQuote(bad,approvalInput,approvalNow))}
console.log('PASS native depositor binding and exact-amount/pinned-spender/canonical approval checks')
if(process.env.POCKET_CROSS_BRIDGE_CAPTURE){const captures=JSON.parse(readFileSync(process.env.POCKET_CROSS_BRIDGE_CAPTURE,'utf8'));let validated=0;const sources=new Set(),destinations=new Set();for(const capture of captures.filter(r=>r.status===200)){const result=validateCrossBridgeRelayQuote(capture.response,capture.input,capture.checkedAt);sources.add(result.source);destinations.add(result.destination);validated++}assert.equal(sources.size,8);assert.equal(destinations.size,8);console.log(`PASS ${validated} recorded live provider quotes covering all 8 source and destination networks; no execution`)}

for(const [status,errorCode,code,expected] of [[400,'NO_SWAP_ROUTES_FOUND','route_unavailable',422],[422,'AMOUNT_TOO_LOW','amount_too_low',422],[429,'PRIVATE_ERROR','rate_limited',429],[500,'NO_SWAP_ROUTES_FOUND','provider_unavailable',503]]){
 await assert.rejects(()=>quoteCrossBridgeRelay(native.i,'fixture-key',async()=>new Response(JSON.stringify({errorCode,message:'private-provider-detail'}),{status,headers:{'Retry-After':'900'}})),e=>e.status===expected&&e.code===code&&!e.message.includes('private-provider-detail')&&(status!==429||e.retryAfter===300))
}
console.log('PASS no-route and amount errors are non-retryable 422; provider errors sanitized; rate limit respected')
