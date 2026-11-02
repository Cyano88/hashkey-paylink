import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fixture,now} from './fixtures/cross-bridge.mjs'
import {CROSS_BRIDGE_NETWORKS,crossBridgeAssets} from '../src/pocket/lib/pocketCrossBridgeAssets.ts'
import {crossBridgeRelayRequest,validateCrossBridgeRelayQuote,quoteCrossBridgeRelay} from '../api/pocket/cross-bridge-provider.ts'
import {relayBridgeAppFee,validateRelayBridgeAppFee} from '../api/pocket/relay-bridge-app-fee.ts'
import {buildCrossBridgeChargedPlan} from '../api/pocket/cross-bridge-reimbursement.ts'
const fee={recipient:'0x3333333333333333333333333333333333333333',bps:10}
let cases=0
for(const source of CROSS_BRIDGE_NETWORKS)for(const destination of CROSS_BRIDGE_NETWORKS){if(source===destination)continue;for(const from of crossBridgeAssets(source))for(const to of crossBridgeAssets(destination)){
 const {q,i}=fixture(source,destination,from.symbol,to.symbol),units=String(BigInt(i.amountUnits)*10n/10000n)
 q.fees.app={amount:units,currency:{...q.details.currencyIn.currency}};q.details.expandedPriceImpact={app:{usd:'-0.001'}}
 const request=crossBridgeRelayRequest(i,fee),route=validateCrossBridgeRelayQuote(q,i,now,fee)
 assert.deepEqual(request.appFees,[{recipient:fee.recipient,fee:'10'}]);assert.equal(route.platformFee.sourceAmountUnits,units);assert.equal(route.platformFee.state,'quoted');assert.equal(route.platformFee.recipientBinding,'server_request');assert.equal(route.amountUnits,i.amountUnits)
 if(source==='base'&&destination==='polygon'&&from.symbol==='ETH'&&to.symbol==='USDT'){
 const binding={ownerId:'fixture',fingerprint:'fixture',source:{network:source,provider:'circle',walletId:'from',address:i.sender},destination:{network:destination,provider:'circle',walletId:'to',address:i.recipient}}
 const built=await buildCrossBridgeChargedPlan(route,binding,100n,'0x4444444444444444444444444444444444444444');assert.equal(built.totalUnits,BigInt(i.amountUnits)+100n,'embedded app fee is not added a second time');assert.equal(built.plan.calls.length,route.execution.calls.length+1)
 }
 for(const change of [r=>r.fees.app.amount='0',r=>r.fees.app.amount=String(BigInt(units)+1n),r=>r.fees.app.currency.decimals++,r=>r.fees.app.currency.chainId=0,r=>r.fees.app.currency.address='wrong',r=>r.details.expandedPriceImpact.app.usd='0']){const bad=structuredClone(q);change(bad);assert.throws(()=>validateCrossBridgeRelayQuote(bad,i,now,fee))}
 assert.throws(()=>validateCrossBridgeRelayQuote(q,i,now));cases++
}}
for(const bad of [{...fee,bps:101},{...fee,bps:0},{...fee,bps:1.5},{...fee,recipient:'0x'+'0'.repeat(40)}])assert.throws(()=>validateRelayBridgeAppFee(bad))
assert.throws(()=>relayBridgeAppFee({}))
if(process.env.POCKET_RELAY_APP_FEE_CAPTURE){const rows=JSON.parse(readFileSync(process.env.POCKET_RELAY_APP_FEE_CAPTURE,'utf8'));for(const r of rows){assert.equal(r.status,200);const route=validateCrossBridgeRelayQuote(r.response,r.input,r.checkedAt,r.appFee);assert.equal(route.platformFee.bps,10);assert.equal(route.platformFee.state,'quoted')}console.log('PASS '+rows.length+' recorded live Relay app-fee quotes; quoted only, no fee collected')}
console.log('PASS '+cases+' fee-enabled cross-asset pairs; app fee/impact/currency validation; separate reimbursement; no duplicate platform charge')
