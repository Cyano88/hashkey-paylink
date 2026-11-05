import assert from 'node:assert/strict'
import {decodeFunctionData,parseAbi} from 'viem'
import {Keypair} from '@solana/web3.js'
import {fixture,now} from './fixtures/cross-bridge.mjs'
import {CROSS_BRIDGE_NETWORKS,crossBridgeAssets} from '../src/pocket/lib/pocketCrossBridgeAssets.ts'
import {validateCrossBridgeRelayQuote} from '../api/pocket/cross-bridge-provider.ts'
import {priceCrossBridgeReimbursement,buildCrossBridgeChargedPlan,quoteCrossBridgeCharges} from '../api/pocket/cross-bridge-reimbursement.ts'
import {priceBscSponsorship} from '../api/pocket/bsc-bridge-fee-estimator.ts'
const policy={providerBps:0,providerAllowanceUsdMicros:0n,marginBps:0,minimumFeeUnits:0n,maximumFeeUnits:10n**25n},price=(scaled8=100000000n)=>({scaled8,observedAt:now})
// Same $1 gas and asset price: exactly one native coin of gas -> one input coin.
let cases=0
for(const network of CROSS_BRIDGE_NETWORKS)for(const token of crossBridgeAssets(network)){
 const units=network==='solana'?10n**9n:10n**18n
 assert.equal(priceCrossBridgeReimbursement(network,token.symbol,units,price(),price(),policy,now).feeUnits,10n**BigInt(token.decimals));cases++
}
assert.equal(priceCrossBridgeReimbursement('arc','USDC',10n**18n,price(),price(),policy,now).feeUnits,1000000n)
assert.equal(priceCrossBridgeReimbursement('solana','USDT',5000n,price(20000000000n),price(),policy,now).feeUnits,1000n)
assert.equal(priceCrossBridgeReimbursement('base','EURC',10n**15n,price(200000000000n),price(125000000n),policy,now).feeUnits,1600000n)
const bscPolicy={...policy,providerBps:500,providerAllowanceUsdMicros:123n,marginBps:1500,minimumFeeUnits:1n}
assert.equal(priceCrossBridgeReimbursement('bsc','USDT',123456789n,price(60000000000n),price(99000000n),bscPolicy,now).feeUnits,priceBscSponsorship(123456789n,price(60000000000n),price(99000000n),bscPolicy,now))
for(const bad of [{...price(),observedAt:now-30000},{...price(),observedAt:now+5001},price(0n)])assert.throws(()=>priceCrossBridgeReimbursement('base','ETH',1n,bad,price(),policy,now))
assert.throws(()=>priceCrossBridgeReimbursement('base','ETH',10n**18n,price(),price(),{...policy,maximumFeeUnits:1n},now))
const treasury='0x3333333333333333333333333333333333333333',solTreasury=Keypair.fromSeed(new Uint8Array(32).fill(7)).publicKey.toBase58(),transferAbi=parseAbi(['function transfer(address to,uint256 amount) returns(bool)'])
for(const network of CROSS_BRIDGE_NETWORKS){
 const token=crossBridgeAssets(network)[0],destination=network==='base'?'polygon':'base',{q,i}=fixture(network,destination,token.symbol,'USDC'),route=validateCrossBridgeRelayQuote(q,i,now)
 const binding={ownerId:'fixture',fingerprint:'bound-wallets',source:{network,provider:network==='bsc'||network==='xlayer'?'privy':'circle',walletId:'source',address:i.sender},destination:{network:destination,provider:'circle',walletId:'destination',address:i.recipient}}
 const recipient=network==='solana'?solTreasury:treasury,built=await buildCrossBridgeChargedPlan(route,binding,123n,recipient)
 assert.equal(built.totalUnits,BigInt(i.amountUnits)+123n)
 await assert.rejects(()=>buildCrossBridgeChargedPlan(route,binding,123n,network==='solana'?'11111111111111111111111111111111':'0x'+'0'.repeat(40)))
 if(built.plan.kind==='evm'){
  assert.equal(built.plan.calls.length,route.execution.calls.length+1,'one reimbursement; no second platform fee');const fee=built.plan.calls.at(-1)
  if(token.native){assert.equal(fee.value,123n);assert.equal(fee.data,'0x');assert.equal(fee.target,recipient)}else{const decoded=decodeFunctionData({abi:transferAbi,data:fee.data});assert.equal(decoded.args[0].toLowerCase(),recipient.toLowerCase());assert.equal(decoded.args[1],123n);assert.equal(fee.value,0n)}
 }else {assert.equal(built.plan.instructions.length,2);assert.equal(built.plan.instructions[1].data.readBigUInt64LE(token.native?4:1),123n)}
 let estimates=0
 const deps={now:()=>now,balance:async()=>BigInt(i.amountUnits)*100n,estimate:async(plan,planHash)=>{estimates++;return{source:network,asset:token.symbol,planHash,nativeUnits:10000n,rentUnits:0n,gasPrice:price(),assetPrice:price(),expiresAt:now+30000}}}
 const fees=await quoteCrossBridgeCharges(route,binding,recipient,{...policy,marginBps:1000},deps)
 assert.equal(fees.totalUnits,BigInt(i.amountUnits)+fees.reimbursementUnits);assert.ok(estimates<=2);assert.equal(fees.walletFingerprint,binding.fingerprint)
 for(const rentUnits of [undefined,-1n,...(network==='solana'?[]:[1n])])await assert.rejects(()=>quoteCrossBridgeCharges(route,binding,recipient,policy,{...deps,estimate:async(plan,hash)=>({...await deps.estimate(plan,hash),rentUnits})}))
 if(network==='solana'){
  const rent=await quoteCrossBridgeCharges(route,binding,recipient,policy,{...deps,estimate:async(plan,hash)=>({...await deps.estimate(plan,hash),rentUnits:2039280n})})
  assert.equal(rent.reimbursementUnits,token.native?2049280n:2050n,'Gas plus account rent must both be reimbursed in source token units')
 }
 await assert.rejects(()=>quoteCrossBridgeCharges(route,binding,recipient,policy,{...deps,balance:async()=>BigInt(i.amountUnits)}),e=>e.status===422)
 await assert.rejects(()=>quoteCrossBridgeCharges(route,binding,recipient,policy,{...deps,estimate:async()=>({...await deps.estimate(null,'wrong')})}))
}
console.log('PASS reimbursement pricing for '+cases+' network/assets; exact Arc/Solana/BNB decimals, EURC value, BNB policy parity, stale-price/cap rejection, atomic fee plans, explicit Solana rent, affordability and estimate binding; Arc included. Fixtures only.')
