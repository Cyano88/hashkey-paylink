import assert from 'node:assert/strict'
import {assertCrossBridgeCoverageReady,crossBridgeCollectedCoverage} from '../api/pocket/cross-bridge-coverage.ts'
const now=1793940000000,wallet='0x'+'a'.repeat(40),hash='0x'+'b'.repeat(64)
let row,proof,reads,prices
const reset=(source='bsc')=>{row={id:'pending',source,walletAddress:wallet,ownerId:'owner',state:'submitted',sourceHash:hash,createdAt:now-1000,quoteToken:'sealed'};proof='pending';reads=0;prices=0}
const deps={now:()=>now,read:async()=>({crossBridge:{pending:row}}),open:async()=>({quote:{input:{source:row.source,from:'USDC'},wallets:{source:{walletId:'wallet'}},reimbursementUnits:'1000000'},route:{tokenIn:{decimals:6}}}),source:async()=>{reads++;if(proof==='pending')throw Object.assign(Error('Proof pending'),{code:'bridge_source_evidence_pending'});return proof},prices:async()=>{prices++;return{assetPrice:{scaled8:100000000n}}}}
const pending=e=>e.code==='previous_bridge_pending'&&e.status===409
for(const source of ['bsc','xlayer']){
 reset(source)
 await assert.rejects(()=>crossBridgeCollectedCoverage(wallet,deps),e=>e.code==='bridge_source_evidence_pending')
 assert.equal(prices,0,'unconfirmed receipt must not enter a billed-versus-zero coverage comparison')
 proof='failed';assert.equal((await crossBridgeCollectedCoverage(wallet,deps))[0].coverageUsdMicros,0n)
 proof='confirmed';assert.equal((await crossBridgeCollectedCoverage(wallet,deps))[0].coverageUsdMicros,950000n)
 row.state='submitting';delete row.sourceHash;reads=0
 await assert.rejects(()=>assertCrossBridgeCoverageReady(wallet,deps),pending)
 await assert.rejects(()=>crossBridgeCollectedCoverage(wallet,deps),pending)
 assert.equal(reads,0,'unknown submission blocks before RPC, prices or route execution')
 await assertCrossBridgeCoverageReady('0x'+'c'.repeat(40),deps)
 assert.deepEqual(await crossBridgeCollectedCoverage('0x'+'c'.repeat(40),deps),[])
 for(const state of ['prepared','cancelled','not_submitted']){row.state=state;await assertCrossBridgeCoverageReady(wallet,deps);assert.deepEqual(await crossBridgeCollectedCoverage(wallet,deps),[])}
 row.state='submitting';row.createdAt=now-29*86400000;await assertCrossBridgeCoverageReady(wallet,deps)
}
console.log('PASS BNB/X Layer pending-proof coverage, exact confirmed fee valuation, proven failure, early unknown-submission block, wallet isolation and unsigned exclusions. No live payments.')
