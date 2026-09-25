import assert from 'node:assert/strict'
import {effectiveProductCapabilities,needsSettlementRouting,productAllowed} from '../src/lib/developerProducts.ts'
const now=Date.now(),base={capabilities:['arc_agreements','xstocks_agreements']}
assert.deepEqual(effectiveProductCapabilities(base,now),base.capabilities)
const key={scopes:['wallet:swap'],expiresAt:new Date(now+60_000).toISOString()}
assert.deepEqual(effectiveProductCapabilities({...base,keys:[key]},now),[...base.capabilities,'swap_arc','swap_xlayer'])
for(const invalid of [{...key,revokedAt:new Date(now).toISOString()},{...key,expiresAt:new Date(now-1).toISOString()},{scopes:['wallet:stocks:read']}]) {
 assert.deepEqual(effectiveProductCapabilities({...base,keys:[invalid]},now),base.capabilities)
}
assert.deepEqual(effectiveProductCapabilities({...base,productSettingsVersion:2,keys:[key]},now),base.capabilities,'Saving explicit settings must prevent legacy permissions reappearing')
assert.equal(needsSettlementRouting(['swap_arc','swap_xlayer','xstocks_agreements']),false)
assert.equal(needsSettlementRouting(['swap_xlayer','arc_agreements']),true)
for(const cap of ['swap_arc','swap_xlayer','xstocks_agreements','polymarket_funding'])assert.equal(productAllowed('agentic',cap),false)
console.log('Product migration passed: only existing unexpired Swap authorization is preserved; explicit removal wins; wallet-only setup and agent boundaries are independent.')
