import assert from 'node:assert/strict'
import {Keypair} from '@solana/web3.js'
import {fixture,now} from './fixtures/cross-bridge.mjs'
import {crossBridgeAssets} from '../src/pocket/lib/pocketCrossBridgeAssets.ts'
import {quoteOwnedCrossBridgeCircle,createCrossBridgeCirclePreflight,createOwnedCrossBridgeCircleRuntime} from '../api/pocket/cross-bridge-circle-quote.ts'
import {fetchCrossBridgeRelayReview} from '../api/pocket/cross-bridge-provider.ts'
import {crossBridgeWalletFingerprint} from '../api/pocket/cross-bridge-wallets.ts'
import {openCrossBridgeReview} from '../api/pocket/cross-bridge-review.ts'
const secret='cross-circle-quote-fixture'.repeat(3)
const env={POCKET_SWAP_QUOTE_SECRET:secret,RELAY_API_KEY:'fixture-key',POCKET_BRIDGE_REVENUE_BPS:'0',POCKET_BRIDGE_REVENUE_EVM_ADDRESS:'0x3333333333333333333333333333333333333333',POCKET_BRIDGE_REVENUE_SOLANA_ADDRESS:Keypair.fromSeed(new Uint8Array(32).fill(7)).publicKey.toBase58()}
const policy={providerBps:0,providerAllowanceUsdMicros:0n,marginBps:0,minimumFeeUnits:1n,maximumFeeUnits:10n**30n}
let count=0
for(const source of ['ethereum','base','arbitrum','polygon'])for(const asset of crossBridgeAssets(source)){
 const {q,i}=fixture(source,source==='base'?'polygon':'base',asset.symbol,'USDC')
 const wallets={ownerId:'owner',source:{network:source,provider:'circle',walletId:'source',address:i.sender},destination:{network:i.destination,provider:'circle',walletId:'dest',address:i.recipient}}
 wallets.fingerprint=crossBridgeWalletFingerprint(wallets)
 let time=now,fee='0.000001',balance=10n**30n,revalidations=0,estimates=[]
 const d={now:()=>time,wallets:async()=>wallets,revalidate:async()=>{revalidations++},balance:async()=>balance,
 prices:async()=>({gasPrice:{scaled8:300000000000n,observedAt:time},assetPrice:{scaled8:asset.native?300000000000n:110000000n,observedAt:time}}),
 estimate:async input=>{assert.equal(input.userToken,'request-token');assert.equal(input.walletId,'source');estimates.push(input.callData);return fee},
 provider:(input,key,fetcher,appFee,clock)=>fetchCrossBridgeRelayReview(input,key,async()=>({ok:true,json:async()=>q}),appFee,clock)}
 const input={ownerId:'owner',userToken:'request-token',source,destination:i.destination,from:asset.symbol,to:'USDC',amountUnits:i.amountUnits}
 const saved=await quoteOwnedCrossBridgeCircle(input,policy,d,env),review=await openCrossBridgeReview(saved.quoteToken,'owner',{secret,now})
 assert.equal(review.charged.plan.callData,estimates.at(-1));assert(estimates.length>=2);assert.equal(revalidations,1)
 assert.equal(BigInt(saved.quote.totalUnits),BigInt(i.amountUnits)+BigInt(saved.quote.reimbursementUnits));assert(!JSON.stringify(saved).includes('request-token'))
 let guarded=0
 const preflight=createCrossBridgeCirclePreflight('request-token',policy,async()=>{guarded++},d,env)
 await preflight(review);assert.equal(guarded,1);assert.equal(estimates.at(-1),review.charged.plan.callData)
 fee='1';await assert.rejects(()=>preflight(review),/fee changed/)
 fee='0.000001';balance=BigInt(i.amountUnits);await assert.rejects(()=>preflight(review),e=>e.code==='insufficient_balance')
 await assert.rejects(()=>quoteOwnedCrossBridgeCircle(input,policy,d,env),e=>e.code==='insufficient_balance')
 balance=10n**30n;time=now+45000;await assert.rejects(()=>preflight(review),/expired/)
 time=now;await assert.rejects(()=>createCrossBridgeCirclePreflight('request-token',policy,async()=>{},d,{...env,POCKET_BRIDGE_REVENUE_BPS:'1'})(review),/policy changed/)
 const rows=new Map();let dispatches=0
 const runtime=createOwnedCrossBridgeCircleRuntime({ownerId:'owner',userToken:'request-token'},policy,async()=>{},d,{
  durable:()=>true,now:()=>time,open:(token,owner,options)=>openCrossBridgeReview(token,owner,{...options,secret}),wallets:async()=>{},approve:async()=>true,
  store:{read:async id=>rows.get(id),mutate:async(id,fn)=>{const next=fn(rows.get(id));rows.set(id,next);return next}},
  dispatch:async input=>{dispatches++;assert.equal(input.callData,review.charged.plan.callData);return {challengeId:'11111111-1111-4111-8111-111111111111'}},
 },env)
 await runtime.prepare(saved.quoteToken,'approval')
 fee='1';await assert.rejects(()=>runtime.submit(saved.quote.id),/fee changed/);assert.equal(dispatches,0);assert.equal(rows.get(saved.quote.id).state,'prepared')
 fee='0.000001';await runtime.submit(saved.quote.id);assert.equal(dispatches,1);assert.equal(rows.get(saved.quote.id).state,'pending')
 await runtime.submit(saved.quote.id);assert.equal(dispatches,1)
 const slow={...d,provider:async(...args)=>{const result=await d.provider(...args);time+=46000;return result}}
 await assert.rejects(()=>quoteOwnedCrossBridgeCircle(input,policy,slow,env));count++
}
console.log(`PASS ${count} Circle source-asset quote/preflight flows: exact final charged batch, provider-start expiry, bound wallets, no stored auth, fresh balance/price/fee recheck, fee increase and policy changes require review. Fixtures; no transactions.`)
