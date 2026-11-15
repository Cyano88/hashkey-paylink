import assert from 'node:assert/strict'
import {build} from 'esbuild'
await build({entryPoints:['api/qr-solana-build.ts'],outfile:'.codex-temp/qr-solana-build-test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'durable-fixture',setup(b){b.onResolve({filter:/render-durable-store\.js$/},()=>({path:'store',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const rows=new Map();let queue=Promise.resolve();export function mutateDurableJson(key,fn){const work=queue.then(()=>{const next=fn(rows.get(key));rows.set(key,next);return next});queue=work.catch(()=>{});return work}`}))}}]})
const {rememberQrSolanaBuild}=await import('../.codex-temp/qr-solana-build-test.mjs')
const a={tx:'first-signed-blockhash',lastValidBlockHeight:100},b={tx:'second-signed-blockhash',lastValidBlockHeight:200}
const results=await Promise.all([rememberQrSolanaBuild('owner','quote',a),rememberQrSolanaBuild('owner','quote',b)])
assert.deepEqual(results,[a,a]);assert.deepEqual(await rememberQrSolanaBuild('owner','quote',b),a)
assert.deepEqual(await rememberQrSolanaBuild('other-owner','quote',b),b)
assert.deepEqual(await rememberQrSolanaBuild('owner','another-quote',b),b)
console.log('PASS concurrent and repeated QR builds return one transaction; other quotes and owners remain isolated.')
