import assert from 'node:assert/strict';
import {boundedCheckoutRequest} from '../src/lib/xstocksAgreement/boundedRequest.ts';
const parent=new AbortController();let aborted;
await assert.rejects(()=>boundedCheckoutRequest(parent.signal,signal=>{aborted=signal;return new Promise(()=>{})},10),/taking too long/);assert.equal(aborted.aborted,true);
assert.equal(await boundedCheckoutRequest(parent.signal,async()=>42,100),42);
const changed=new AbortController();const request=boundedCheckoutRequest(changed.signal,()=>new Promise(()=>{}),1000);changed.abort();await assert.rejects(()=>request,/session changed/);
await assert.rejects(()=>boundedCheckoutRequest(changed.signal,async()=>{throw Error('Should not start')}),/session changed/);
console.log('Checkout deadline passed: stalled session/request, success, unmount and already-aborted session.');
