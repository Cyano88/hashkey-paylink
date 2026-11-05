import assert from 'node:assert/strict'
import {formatUnits} from 'viem'
import {fixture,now} from './fixtures/cross-bridge.mjs'
import {CROSS_BRIDGE_NETWORKS,crossBridgeAssets} from '../src/pocket/lib/pocketCrossBridgeAssets.ts'
import {crossBridgeConfiguredPolicy} from '../api/pocket/cross-bridge-policy.ts'
import {crossBridgePreflight} from '../api/pocket/cross-bridge-quote.ts'
import {quoteCrossBridgeCharges,crossBridgeReimbursementRecipient} from '../api/pocket/cross-bridge-reimbursement.ts'
import {createCrossBridgeReview,openCrossBridgeReview} from '../api/pocket/cross-bridge-review.ts'
import {validateCrossBridgeRelayQuote} from '../api/pocket/cross-bridge-provider.ts'
import {crossBridgeWalletFingerprint} from '../api/pocket/cross-bridge-wallets.ts'
import {bufferedNativeFee} from '../api/pocket/native-send-quote.ts'
import {Keypair} from '@solana/web3.js'
const secret='deep-bridge-review-regression-'.repeat(3)
const env={POCKET_SWAP_QUOTE_SECRET:secret,POCKET_CROSS_BRIDGE_MIN_FEE_USD_MICROS:'0',POCKET_CROSS_BRIDGE_MAX_FEE_USD_MICROS:'100000000',POCKET_XLAYER_PROVIDER_FEE_BPS:'100',POCKET_XLAYER_PROVIDER_FIXED_USD_MICROS:'100',POCKET_XLAYER_FEE_MARGIN_BPS:'1500',POCKET_BRIDGE_REVENUE_BPS:'0',POCKET_BRIDGE_REVENUE_EVM_ADDRESS:'0x3333333333333333333333333333333333333333',POCKET_BRIDGE_REVENUE_SOLANA_ADDRESS:Keypair.fromSeed(new Uint8Array(32).fill(7)).publicKey.toBase58(),SOLANA_TREASURY:Keypair.fromSeed(new Uint8Array(32).fill(8)).publicKey.toBase58()}
let cases=0
for(const source of CROSS_BRIDGE_NETWORKS)for(const asset of crossBridgeAssets(source)){
 const destination=source==='base'?'polygon':'base',{q,i}=fixture(source,destination,asset.symbol,'USDC'),route=validateCrossBridgeRelayQuote(q,i,now)
 const wallets={ownerId:'fixture',source:{network:source,provider:['bsc','xlayer'].includes(source)?'privy':'circle',walletId:'source',address:i.sender},destination:{network:destination,provider:'circle',walletId:'destination',address:i.recipient}};wallets.fingerprint=crossBridgeWalletFingerprint(wallets)
 let time=now,gas=1000000n,priceAge=15000,delay=0,balance=10n**35n
 const price=()=>({scaled8:100000000n,observedAt:time-priceAge})
 const policy=crossBridgeConfiguredPolicy(source,asset.symbol,price(),env)
 assert.equal(policy.providerBps,['bsc','xlayer'].includes(source)?100:source==='solana'?0:500)
 assert.equal(policy.marginBps,['bsc','xlayer'].includes(source)?1500:source==='solana'?0:5000)
 const readers={balance:async()=>balance,estimate:async(plan,planHash)=>{time+=delay;return{source,asset:asset.symbol,planHash,nativeUnits:gas,rentUnits:0n,gasPrice:price(),assetPrice:price(),expiresAt:time+30000-priceAge}}}
 const charged=await quoteCrossBridgeCharges(route,wallets,crossBridgeReimbursementRecipient(source,env),policy,{...readers,now:()=>time})
 assert.equal(charged.expiresAt,route.expiresAt,'15-second-old price must not shorten a freshly verified executable route')
 const saved=await createCrossBridgeReview({wallets,input:i,providerQuote:q,appFee:null,...charged},{secret,now:time}),review=await openCrossBridgeReview(saved.quoteToken,'fixture',{secret,now:time})
 const before=JSON.stringify(review.quote)
 let guards=0
 const preflight=crossBridgePreflight('request-only',async()=>{guards++},env,{now:()=>time,revalidate:async()=>{},readers:()=>readers})
 time=now+21000;priceAge=0
 await preflight(review)
 if(!['solana','bsc','xlayer'].includes(source)){
  assert.equal(bufferedNativeFee(formatUnits(1000000n,18)),1500000n)
  gas=1400000n;await preflight(review)
  // A second check must consume the reserve, not rebuild another 50% margin.
  time=now+32000;await preflight(review)
 }
 assert.equal(JSON.stringify(review.quote),before,'No fee, calldata, amount or expiry mutation after review')
 gas=10n**24n;await assert.rejects(()=>preflight(review),e=>e.code==='cross_bridge_fee_changed'||/fees are unavailable|Network fees are high/.test(e.message))
 gas=1000000n;priceAge=30000;await assert.rejects(()=>preflight(review),/expired/)
 priceAge=0;balance=0n;await assert.rejects(()=>preflight(review),e=>e.code==='insufficient_balance');balance=10n**35n
 time=now+44000;delay=2000;await assert.rejects(()=>preflight(review),/expired/)
 delay=0;await assert.rejects(()=>openCrossBridgeReview(saved.quoteToken,'fixture',{secret,now:now+45000}),e=>e.code==='bridge_review_invalid')
 // Expired signed reviews remain readable only for recovery, never resubmission.
 await openCrossBridgeReview(saved.quoteToken,'fixture',{secret,now:now+45000,recovery:true})
 assert(guards>=4);cases++
}
console.log('PASS '+cases+' source/assets: production preflight, Circle allowance parity, 45s route-bound review, old price snapshot, repeated fee jitter, immutable approved debit, fee cap, stale price, balance loss, expiry during preflight, recovery-only expiry')

// Live Polygon regression: reserve exceeded the global $0.10 ceiling.
const livePrice={scaled8:9417047n,observedAt:now};
const limits={...env,POCKET_CROSS_BRIDGE_MAX_FEE_USD_MICROS:'100000'};
const oldLimit=crossBridgeConfiguredPolicy('polygon','POL',livePrice,limits);
const polygonLimits={...limits,POCKET_CROSS_BRIDGE_POLYGON_MAX_FEE_USD_MICROS:'250000'};
const polygonLimit=crossBridgeConfiguredPolicy('polygon','POL',livePrice,polygonLimits);
assert(polygonLimit.maximumFeeUnits>oldLimit.maximumFeeUnits);
assert.deepEqual(crossBridgeConfiguredPolicy('base','ETH',livePrice,limits),crossBridgeConfiguredPolicy('base','ETH',livePrice,polygonLimits));
const {priceCrossBridgeReimbursement}=await import('../api/pocket/cross-bridge-reimbursement.ts');
assert.throws(()=>priceCrossBridgeReimbursement('polygon','POL',922455509019726241n,livePrice,livePrice,oldLimit,now),e=>e.feeCheck?.reason==='fee_limit'&&e.message==='Network fees are high. Try this route again shortly.');
const priced=priceCrossBridgeReimbursement('polygon','POL',922455509019726241n,livePrice,livePrice,polygonLimit,now);
assert.equal(priced.feeUnits,1452867426706068831n);
assert(priced.feeUnits<polygonLimit.maximumFeeUnits);
assert.equal(crossBridgeConfiguredPolicy('polygon','POL',livePrice,limits).maximumFeeUnits,oldLimit.maximumFeeUnits,'No override preserves existing fee ceiling');
console.log('PASS captured Polygon fee: explicit limit error, optional isolated ceiling, same gas reserve, unchanged other networks');

for(const source of CROSS_BRIDGE_NETWORKS)for(const asset of crossBridgeAssets(source)){
 const key='POCKET_CROSS_BRIDGE_'+source.toUpperCase()+'_MAX_FEE_USD_MICROS';
 const basePolicy=crossBridgeConfiguredPolicy(source,asset.symbol,livePrice,limits);
 const isolated=crossBridgeConfiguredPolicy(source,asset.symbol,livePrice,{...limits,[key]:'250000'});
 assert(isolated.maximumFeeUnits>basePolicy.maximumFeeUnits);
 for(const other of CROSS_BRIDGE_NETWORKS){if(other===source)continue;const otherAsset=crossBridgeAssets(other)[0].symbol;assert.deepEqual(crossBridgeConfiguredPolicy(other,otherAsset,livePrice,limits),crossBridgeConfiguredPolicy(other,otherAsset,livePrice,{...limits,[key]:'250000'}))}
}
console.log('PASS all 26 source/assets: independent network ceilings with unchanged defaults and other networks');
