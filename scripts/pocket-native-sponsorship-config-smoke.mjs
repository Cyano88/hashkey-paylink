import assert from 'node:assert/strict';
import {runtimePublicConfig} from '../api/runtime-public-config.ts';
for(const env of [{},{POCKET_XLAYER_SPONSORSHIP_ENABLED:'true'},{VITE_XLAYER_TRANSFER_SPONSORSHIP:'true'}])assert.equal(runtimePublicConfig(env).xlayer.transferSponsorshipEnabled,false);
assert.equal(runtimePublicConfig({POCKET_XLAYER_SPONSORSHIP_ENABLED:'true',VITE_XLAYER_TRANSFER_SPONSORSHIP:'true'}).xlayer.transferSponsorshipEnabled,true);
assert.equal(Object.keys(runtimePublicConfig({POCKET_XLAYER_SPONSORSHIP_WALLETS:'private'}).xlayer).length,1);
console.log('PASS native sponsorship capability requires both switches and discloses no wallet allowlist');
