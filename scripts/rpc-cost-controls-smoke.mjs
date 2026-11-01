import assert from 'node:assert/strict'
import {createBackgroundBillingAudit} from '../api/pocket/background-billing-audit.ts'
import {createBscDisplayReader,parseBscDisplayBalances} from '../api/pocket/bsc-display-balances.ts'
import {POCKET_BSC} from '../src/pocket/lib/pocketBsc.ts'
import {createRecoveryBackoff} from '../api/pocket/recovery-backoff.ts'

let now=1000000,calls=0,fail=false
const audit=createBackgroundBillingAudit(async()=>{calls++;if(fail)throw Error('billing unavailable')},()=>now)
await Promise.all(Array.from({length:20},()=>audit()));assert.equal(calls,1)
for(let i=0;i<14;i++){now+=60000;await audit()}assert.equal(calls,1)
now+=60000;await audit();assert.equal(calls,2)
now+=900000;fail=true;await assert.rejects(audit,/billing unavailable/)
await assert.rejects(audit,/billing unavailable/);assert.equal(calls,3,'Failed audits stay failed without repeated provider calls')
now+=60000;await assert.rejects(audit,/billing unavailable/);assert.equal(calls,4)
now+=60000;await assert.rejects(audit,/billing unavailable/);assert.equal(calls,4)
now+=60000;fail=false;await audit();assert.equal(calls,5)

const wallet='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40)
const rows=Object.values(POCKET_BSC.assets).map(a=>({chainIndex:'56',tokenContractAddress:a.native?'':a.address,balance:'1.000000000000000001',rawBalance:'1000000000000000001',address:wallet}))
assert.equal(parseBscDisplayBalances([{tokenAssets:rows}],wallet).USDC,1000000000000000001n)
for(const mutate of [r=>r.pop(),r=>r.push(r[0]),r=>r[1].chainIndex='1',r=>r[1].address=other,r=>r[1].balance='-1',r=>r[1].balance='0.0000000000000000001',r=>r[1].rawBalance='1',r=>r[1].tokenContractAddress=r[2].tokenContractAddress]){
 const copy=structuredClone(rows);mutate(copy);assert.throws(()=>parseBscDisplayBalances([{tokenAssets:copy}],wallet))
}
let provider=0,rpc=0,providerFail=false,rpcFail=false
const read=createBscDisplayReader(async()=>{provider++;if(providerFail)throw Error('provider');return {BNB:0n,USDC:1n,USDT:2n}},async()=>{rpc++;if(rpcFail)throw Error('rpc');return {BNB:3n,USDC:4n,USDT:5n}},()=>now)
const results=await Promise.all(Array.from({length:20},()=>read(wallet)));assert.equal(provider,1);assert.equal(rpc,0)
results[0].units.USDC=999n;assert.equal((await read(wallet)).units.USDC,1n)
await read(other);assert.equal(provider,2,'Wallets are independently scoped')
now+=15000;providerFail=true;assert.equal((await read(wallet)).units.USDC,4n);assert.equal(rpc,1)
now+=15000;await read(wallet);assert.equal(provider,3);assert.equal(rpc,2,'Provider cooldown uses bounded fallback')
now+=15000;rpcFail=true;await assert.rejects(()=>read(wallet));const previousCalls=rpc
await assert.rejects(()=>read(wallet));assert.equal(rpc,previousCalls,'No stale success or retry storm after both providers fail')
now+=60000;providerFail=false;assert.equal((await read(wallet)).units.USDC,1n)
console.log('PASS scheduled billing cadence, single flight, failure backoff, BNB chain/token/precision/owner checks, display-only cache isolation, provider recovery, no stale success.')

let recoveries=0,recoveryFails=true
const recover=createRecoveryBackoff(()=>now)
const operation=async()=>{recoveries++;if(recoveryFails)throw Error('RPC unavailable');return 'verified'}
await assert.rejects(()=>recover('owner:intent:revision1',operation),/RPC unavailable/)
await assert.rejects(()=>recover('owner:intent:revision1',operation),/RPC unavailable/);assert.equal(recoveries,1)
await assert.rejects(()=>recover('owner:intent:revision2',operation));assert.equal(recoveries,2,'New evidence bypasses old retry backoff')
now+=60000;await assert.rejects(()=>recover('owner:intent:revision1',operation));assert.equal(recoveries,3)
now+=60000;await assert.rejects(()=>recover('owner:intent:revision1',operation));assert.equal(recoveries,3)
now+=60000;recoveryFails=false;assert.equal(await recover('owner:intent:revision1',operation),'verified')
assert.equal(await recover('owner:intent:revision1',operation),'verified');assert.equal(recoveries,5,'Successful recovery is not cached as future payment proof')
let release
const blocked=new Promise(resolve=>{release=resolve})
let concurrent=0
const jobs=Array.from({length:10},()=>recover('one-revision',async()=>{concurrent++;await blocked;return true}))
release();await Promise.all(jobs);assert.equal(concurrent,1)
console.log('PASS scheduled recovery: backoff retains failure, changed evidence retries immediately, success clears cooldown, concurrent jobs share one attempt.')
