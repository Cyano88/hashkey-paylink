import assert from 'node:assert/strict'
import {xlayerBridgeWalletEligible as allowed} from '../api/pocket/xlayer-bridge-access.ts'
const first='0x'+'a'.repeat(40),second='0x'+'b'.repeat(40)
const pilot={POCKET_XLAYER_BRIDGE_ENABLED:'true',POCKET_XLAYER_BRIDGE_WALLETS:first}
assert.equal(allowed(first,pilot),true);assert.equal(allowed(second,pilot),false)
assert.equal(allowed(second,{...pilot,POCKET_XLAYER_BRIDGE_PUBLIC_ENABLED:'true'}),true)
assert.equal(allowed(second,{...pilot,POCKET_XLAYER_BRIDGE_PUBLIC_ENABLED:'TRUE'}),false)
assert.equal(allowed(first,{...pilot,POCKET_XLAYER_BRIDGE_WALLETS:''}),false)
assert.equal(allowed(second,{...pilot,POCKET_XLAYER_BRIDGE_PUBLIC_ENABLED:'true',POCKET_XLAYER_BRIDGE_ENABLED:'false'}),false)
for(const wallet of ['', 'invalid','0x'+'0'.repeat(40)])assert.equal(allowed(wallet,{...pilot,POCKET_XLAYER_BRIDGE_PUBLIC_ENABLED:'true'}),false)
console.log('PASS public rollout eligibility, explicit opt-in, pilot rollback, master off switch, invalid wallets and empty allowlist remain denied.')
