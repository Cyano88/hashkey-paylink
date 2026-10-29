import assert from 'node:assert/strict';
import {readPocketAccessToken} from '../src/pocket/lib/pocketAccessToken.ts';
assert.equal(await readPocketAccessToken(async()=> 'token'),'token');
assert.equal(await readPocketAccessToken(async()=>null),null);
let reads=0;
await assert.rejects(()=>readPocketAccessToken(async()=>{reads++;throw new Error('[POST] auth.privy.io <no response> TimeoutError')}),/Could not refresh your sign-in session/);
assert.equal(reads,1);
const original=Error('Account changed');await assert.rejects(()=>readPocketAccessToken(async()=>{throw original}),e=>e===original);
console.log('PASS auth transport errors translated, no automatic replay, non-transport errors preserved');
