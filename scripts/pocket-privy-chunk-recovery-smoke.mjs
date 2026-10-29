import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
await mkdir('.codex-temp',{recursive:true});
await build({entryPoints:['src/pocket/lib/pocketStockSubmission.ts'],bundle:true,platform:'node',format:'esm',outfile:'.codex-temp/privy-chunk-regression.mjs'});
const values=new Map();globalThis.localStorage={get length(){return values.size},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
const {stockSubmissionError,isPrivyAuthorizationLoadError,runStockSubmission,readStockAttempts,signingKey}=await import('../.codex-temp/privy-chunk-regression.mjs');
const failure=()=>new Error('Loading chunk 8700 failed. (error: https://auth.privy.io/_next/static/chunks/8700.4de5f6e2e38cc845.js?dpl=example)');
assert.equal(stockSubmissionError(failure()).reconnectWallet,true);
assert.doesNotMatch(stockSubmissionError(failure()).message,/8700|https:/);
assert.equal(isPrivyAuthorizationLoadError(failure()),false,'Uninspected chunks never prove no submission');
const marked=Object.assign(failure(),{transactionPending:true,attemptId:'retained'});
assert.equal(stockSubmissionError(marked).transactionPending,true);
assert.equal(stockSubmissionError(marked).attemptId,'retained');
for(const host of ['auth.privy.io.evil.test','other.test'])assert.equal(stockSubmissionError(new Error(failure().message.replace('auth.privy.io',host))).reconnectWallet,undefined);
assert.equal(stockSubmissionError(new Error('outer',{cause:failure()})).reconnectWallet,true);
let sends=0;
await assert.rejects(()=>runStockSubmission({key:'unknown',kind:'trade',send:async()=>{sends++;throw failure()},onPending:()=>{},onUncertain:v=>assert.equal(typeof v,'boolean')}),e=>e.reconnectWallet&&e.transactionPending);
assert.equal(readStockAttempts('unknown')[0].status,'pending');assert.ok(localStorage.getItem(signingKey('unknown')));
await assert.rejects(()=>runStockSubmission({key:'unknown',kind:'trade',send:async()=>{sends++;throw failure()},onPending:()=>{},onUncertain:()=>{}}),/still being checked/);assert.equal(sends,1);
// Native signs separately: failure before signed bytes means broadcast was never called.
const native=await import('node:fs/promises').then(fs=>fs.readFile('src/pocket/lib/pocketStockSubmission.ts','utf8'));
if(native.includes('options.prepare')){
 await assert.rejects(()=>runStockSubmission({key:'sign-only',kind:'trade',prepare:async()=>{throw failure()},send:async()=>{sends++;throw Error('must not send')},onPending:()=>{},onUncertain:v=>assert.equal(v,false)}),e=>e.reconnectWallet&&!e.transactionPending);
 assert.equal(readStockAttempts('sign-only')[0].status,'failed');assert.equal(localStorage.getItem(signingKey('sign-only')),null);assert.equal(sends,1);
}
console.log('PASS Privy chunk recovery: current and nested error mapping, pending evidence retained, no duplicate send, sign-only failure safe');
