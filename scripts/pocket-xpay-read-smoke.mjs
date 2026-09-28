import assert from 'node:assert/strict'
import {readXPayJson,cacheXPayMine,readXPayMineCache,clearXPayMineCache} from '../src/pocket/lib/pocketXPayRead.ts'
let calls=0
const ok=()=>new Response(JSON.stringify({ok:true,checkouts:[],destinations:[]}))
globalThis.fetch=async()=>++calls===1?new Response('<html>Bad gateway</html>',{status:502}):ok()
assert.equal((await readXPayJson('https://fixture.invalid',{},true)).ok,true);assert.equal(calls,2)
calls=0;globalThis.fetch=async()=>{calls++;return new Response('<html>Bad gateway</html>',{status:502})}
await assert.rejects(readXPayJson('https://fixture.invalid',{},true),/temporarily unavailable/);assert.equal(calls,2)
calls=0;await assert.rejects(readXPayJson('https://fixture.invalid',{method:'POST'}),/temporarily unavailable/);assert.equal(calls,1)
calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({ok:false,error:'Deleted QR'}),{status:404})}
await assert.rejects(readXPayJson('https://fixture.invalid',{},true),/Deleted QR/);assert.equal(calls,1)
cacheXPayMine('one',{checkouts:[],destinations:[]});assert.ok(readXPayMineCache('one'));assert.equal(readXPayMineCache('two'),undefined);clearXPayMineCache('one');assert.equal(readXPayMineCache('one'),undefined)
console.log('PASS HTML 502 recovery, bounded retry, no mutation replay, permanent error handling and owner-scoped cache.')

const {mergePocketActivitySnapshot}=await import('../src/pocket/lib/pocketActivitySnapshot.ts')
const snapshot={payments:[],collections:[],merchants:[{merchant_id:'qr',display_name:'Shop',deleted_at:'2026-09-27T00:00:00Z'}]}
const result=mergePocketActivitySnapshot(snapshot,{...snapshot,merchants:[{merchant_id:'qr',display_name:'Shop'}]})
assert.equal(result.merchants[0].deleted_at,snapshot.merchants[0].deleted_at)
console.log('PASS a late stale activity response cannot resurrect a deleted QR.')
