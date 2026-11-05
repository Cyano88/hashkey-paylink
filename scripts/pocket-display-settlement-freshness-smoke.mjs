import assert from 'node:assert/strict'
import {createDisplaySettlementReader,assertDisplaySnapshotCurrent} from '../api/pocket/display-balance-settlement.ts'
import {fetchCircleNativeBalance,createNativeBalanceReader} from '../api/pocket/native-balances.ts'
import {fetchCircleTokenUnits,createCircleTokenDisplayReader} from '../api/pocket/circle-token-display.ts'
const address='0x'+'1'.repeat(40),token='0x'+'2'.repeat(40),when=Date.parse('2026-11-05T12:00:00Z')
const link={privyUserId:'owner',chain:'arbitrum',circleWalletId:'wallet',circleWalletAddress:address,circleBlockchain:'ARB',updatedAt:1}
let calls=0,now=when,journal={crossBridge:{one:{ownerId:'owner',settlement:{outcome:'completed',network:'arbitrum',recipient:address,token:{native:true,symbol:'ETH'},verifiedAt:when}}}}
const settled=createDisplaySettlementReader(async()=>{calls++;return journal},()=>now)
assert.deepEqual(await Promise.all([settled(link,{native:true,symbol:'ETH'}),settled(link,{native:true,symbol:'ETH'})]),[when,when]);assert.equal(calls,1)
assert.equal(await settled({...link,privyUserId:'other'},{native:true,symbol:'ETH'}),0)
assert.equal(await settled({...link,chain:'base'},{native:true,symbol:'ETH'}),0)
assert.equal(await settled({...link,circleWalletAddress:token},{native:true,symbol:'ETH'}),0)
assert.equal(await settled(link,{address:token}),0)
assert.throws(()=>assertDisplaySnapshotCurrent('2026-11-05T09:24:09Z',when));assert.throws(()=>assertDisplaySnapshotCurrent(undefined,when));assertDisplaySnapshotCurrent('2026-11-05T12:00:01Z',when)
process.env.CIRCLE_API_KEY='LIVE_fixture'
let rows=[{amount:'0.000018854450176871',updateDate:'2026-11-05T09:24:09Z',token:{id:'native',isNative:true,symbol:'ETH',decimals:18,blockchain:'ARB'}}]
const fetcher=async url=>new Response(JSON.stringify({data:url.includes('/balances?')?{tokenBalances:rows}:{wallet:{id:'wallet',address,blockchain:'ARB'}}}))
await assert.rejects(fetchCircleNativeBalance(link,fetcher,settled),/predates/)
let rpc=0
const reader=createNativeBalanceReader(async l=>{try{return await fetchCircleNativeBalance(l,fetcher,settled)}catch{rpc++;return 0.000640459497824501}},fetcher,()=>now)
const readLink=async key=>key.includes('arbitrum')?link:null
const result=await reader('owner',readLink);assert.equal(result[2].quantity,0.000640459497824501)
await reader('owner',readLink);assert.equal(rpc,1,'shared cache bounds stale snapshot fallback')
rows[0].updateDate='2026-11-05T12:00:01Z';assert.equal(await fetchCircleNativeBalance(link,fetcher,settled),Number(rows[0].amount))
rows=[];await assert.rejects(fetchCircleNativeBalance(link,fetcher,settled),/predates/)
now+=16000;journal={crossBridge:{one:{ownerId:'owner',settlement:{outcome:'refunded',network:'arbitrum',recipient:address,token:{native:false,address:token},verifiedAt:when}}}}
const asset={address:token,decimals:6}
rows=[{amount:'1.25',updateDate:'2026-11-05T09:24:09Z',token:{isNative:false,tokenAddress:token,decimals:6,blockchain:'ARB'}}]
await assert.rejects(fetchCircleTokenUnits(link,asset,fetcher,settled),/predates/)
let tokenRpc=0;const tokenReader=createCircleTokenDisplayReader((l,t)=>fetchCircleTokenUnits(l,t,fetcher,settled),()=>now)
assert.equal(await tokenReader(link,asset,async()=>{tokenRpc++;return 2250000n}),2250000n)
await tokenReader(link,asset,async()=>{tokenRpc++;return 2250000n});assert.equal(tokenRpc,1)
rows[0].updateDate='2026-11-05T12:00:01Z';assert.equal(await fetchCircleTokenUnits(link,asset,fetcher,settled),1250000n)
console.log('PASS stale receipt snapshots use cached RPC, current Circle snapshots win, missing rows cannot erase credits, owner/network/address/token isolation, native and token refund coverage')
