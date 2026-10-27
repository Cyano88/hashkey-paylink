import assert from 'node:assert/strict'
import {checkoutHandoff} from '../src/lib/checkoutHandoff.ts'
import {parsePocketScanCode,pocketScanDestination} from '../src/pocket/lib/pocketScanCode.ts'
for(const id of ['chk_12345678','chkx_0123456789abcdef01234567'])for(const attempt of ['', 'att_123-abc']){const handoff=checkoutHandoff(id,attempt);const parsed=parsePocketScanCode(handoff.url);assert.equal(parsed.id,id);assert.equal(parsed.attempt,attempt);assert.ok(pocketScanDestination(handoff.url).startsWith('/home/scan?code='));assert.equal(new URL(handoff.browser,'https://app.hashpaylink.com').searchParams.get('browser'),'1');assert.ok(handoff.android.includes('package=com.hashpaylink.pocket;'));assert.ok(handoff.android.includes('S.browser_fallback_url='+encodeURIComponent(new URL(handoff.browser,'https://app.hashpaylink.com').href)))}
for(const id of ['https://evil.test','chk_12345678#Intent;','../pay','chk_short'])assert.throws(()=>checkoutHandoff(id))
for(const attempt of ['x&recipient=evil','x#Intent;','x'.repeat(81)])assert.throws(()=>checkoutHandoff('chk_12345678',attempt))
console.log('PASS handoff preserves server order and attempt, matches native parser, encodes browser fallback, rejects URL/intent injection.')
