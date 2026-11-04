import assert from 'node:assert/strict'
import {readPocketEurcBalances} from '../api/pocket/eurc-balances.ts'
import {nativeSwapPair} from '../src/pocket/lib/pocketNativeSwap.ts'
const address='0x1111111111111111111111111111111111111111'
const link=async key=>({privyUserId:'owner',chain:key.includes('arc')?'arc':'base',purpose:'payment',circleBlockchain:key.includes('arc')?'ARC':'BASE',circleWalletAddress:address})
const rows=await readPocketEurcBalances('owner',link,async()=>10,async()=>1.12)
assert.deepEqual(rows.map(r=>r.valueUsd),[11.200000000000001,11.200000000000001])
assert.ok(rows.every(r=>r.status==='ok'&&r.quantity===10))
const missingPrice=await readPocketEurcBalances('owner',link,async()=>10,async()=>{throw Error('offline')})
assert.ok(missingPrice.every(r=>r.quantity===10&&r.valueUsd===null),'must not substitute a dollar peg for EURC')
let read=false
const wrongOwner=await readPocketEurcBalances('owner',async key=>({...await link(key),privyUserId:'other'}),async()=>{read=true;return 1},async()=>1.12)
assert.equal(read,false);assert.ok(wrongOwner.every(r=>r.status==='error'&&r.quantity===null))
const noWallet=await readPocketEurcBalances('owner',async()=>null,async()=>{throw Error('should not read')},async()=>1.12)
assert.ok(noWallet.every(r=>r.quantity===0&&r.valueUsd===0))
assert.equal(nativeSwapPair('base','EURC','USDC').tokenIn.decimals,6)
for(const network of ['ethereum','arbitrum','polygon','solana'])assert.throws(()=>nativeSwapPair(network,'EURC','USDC'))
console.log('PASS EURC valuation, owner binding, outage handling and exact network eligibility')
