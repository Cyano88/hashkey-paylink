import assert from 'node:assert/strict'
import { build } from 'esbuild'
import fs from 'node:fs'
await build({entryPoints:['src/pocket/lib/pocketXPayProgress.ts'],outfile:'.codex-temp/xpay-progress-test.mjs',format:'esm',platform:'node'})
const {xpayProgressSteps}=await import('../.codex-temp/xpay-progress-test.mjs')
assert.deepEqual(xpayProgressSteps({payment:'waiting'}).map(s=>[s.id,s.active,s.done]),[['payment',false,false]])
assert.deepEqual(xpayProgressSteps({payment:'submitted'}).map(s=>s.id),['payment'])
const bridge=xpayProgressSteps({swap:'confirmed',bridge:'submitted',payment:'waiting'})
assert.deepEqual(bridge.map(s=>s.done),[true,false,false]);assert.deepEqual(bridge.map(s=>s.active),[false,true,false])
assert.deepEqual(xpayProgressSteps({bridge:'submitted',payment:'waiting'}).map(s=>s.id),['bridge','payment'])
const inconsistent=xpayProgressSteps({swap:'submitted',bridge:'confirmed',payment:'confirmed'})
assert.equal(inconsistent.some(s=>s.done),false)
const failed=xpayProgressSteps({swap:'confirmed',bridge:'failed',payment:'waiting'})
assert.deepEqual(failed.map(s=>s.failed),[false,true,false]);assert.equal(failed.some(s=>s.active),false)
assert.equal(xpayProgressSteps({swap:'confirmed',bridge:'confirmed',payment:'submitted'})[2].active,true)
console.log('PASS proof-driven stage ordering, optional stages, no premature checks, failure stops progress, payment confirmation distinct from bridging.')
const {xpayRecoveryView}=await import('../.codex-temp/xpay-progress-test.mjs')
const swapFailure={swap:'failed',bridge:'waiting',payment:'waiting'}
assert.equal(xpayRecoveryView(swapFailure,{stage:'swap',reason:'insufficient_okb',outcome:'not_submitted'}).action,'swap')
assert.match(xpayRecoveryView(swapFailure,{stage:'swap',reason:'insufficient_okb',outcome:'not_submitted'}).reason,/Add OKB in Pocket/)
const bridgeFailure={swap:'confirmed',bridge:'failed',payment:'waiting'}
assert.equal(xpayRecoveryView(bridgeFailure,{stage:'bridge',reason:'provider_unavailable',outcome:'not_submitted',burn:'confirmed'}).action,'bridge_mint')
for(const burn of [undefined,'submitted'])assert.equal(xpayRecoveryView(bridgeFailure,{stage:'bridge',reason:'provider_unavailable',outcome:'not_submitted',burn}).action,undefined)
assert.equal(xpayRecoveryView(bridgeFailure,{stage:'bridge',reason:'insufficient_okb',outcome:'not_submitted',burn:'not_submitted'}).action,'bridge_burn')
assert.equal(xpayRecoveryView(bridgeFailure,{stage:'bridge',reason:'provider_unavailable',outcome:'unknown',burn:'confirmed'}).action,undefined)
assert.equal(xpayRecoveryView(bridgeFailure,{stage:'swap',reason:'unknown',outcome:'not_submitted'}).action,undefined)
console.log('PASS safe retries: OKB guidance, completed swap retained, confirmed burn resumes mint, uncertain outcome blocks retries.')
