import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createCheckpointRecoveryScan, CheckpointRecoveryPending, checkpointRecoveryDeploymentBlock } from '../api/checkpoint-recovery-scan.ts'
let now=0
const scan=createCheckpointRecoveryScan(()=>now)
const ranges=[]
const range=async(from,to)=>{ranges.push([from,to]);return null}
await assert.rejects(scan('old',0n,10n,async()=>99n,range),CheckpointRecoveryPending)
assert.deepEqual(ranges,[[90n,99n],[80n,89n],[70n,79n],[60n,69n]])
await assert.rejects(scan('old',0n,10n,async()=>999n,range),CheckpointRecoveryPending)
assert.equal(ranges.length,4)
now+=5000
await assert.rejects(scan('old',0n,10n,async()=>999n,range),CheckpointRecoveryPending)
assert.deepEqual(ranges.at(-1),[20n,29n])
now+=5000
assert.deepEqual(await scan('old',0n,10n,async()=>999n,async(from,to)=>{ranges.push([from,to]);return from===0n?{vault:'old-session'}:null}),{vault:'old-session'})
assert.deepEqual(ranges.at(-1),[0n,9n])
// Failed ranges retain their cursor and do not become a cached absence.
const failing=createCheckpointRecoveryScan(()=>now)
const attempted=[]
await assert.rejects(failing('a',0n,10n,async()=>29n,async(f,t)=>{attempted.push([f,t]);if(f===10n)throw Error('private upstream detail');return null}),e=>e instanceof CheckpointRecoveryPending&&!e.message.includes('private'))
await assert.rejects(failing('other',0n,10n,async()=>0n,range),CheckpointRecoveryPending)
now+=60000
assert.equal(await failing('a',0n,10n,async()=>999n,async(f,t)=>{attempted.push([f,t]);return null}),null)
assert.deepEqual(attempted,[[20n,29n],[10n,19n],[10n,19n],[0n,9n]])
const count=attempted.length
assert.equal(await failing('a',0n,10n,async()=>{throw Error('should be cached')},range),null)
assert.equal(attempted.length,count)
now+=30000
let refreshed=false
assert.equal(await failing('a',0n,10n,async()=>{refreshed=true;return 0n},async()=>null),null)
assert.equal(refreshed,true)
// Identical concurrent requests share work. Other keys cannot exceed concurrency.
const shared=createCheckpointRecoveryScan(()=>now)
let release;let calls=0
const held=new Promise(resolve=>{release=resolve})
const head=async()=>{calls++;await held;return 0n}
const tasks=Array.from({length:8},()=>shared('same',0n,10n,head,async()=>null))
await Promise.resolve();assert.equal(calls,1)
const extra=['b','c','d'].map(k=>shared(k,0n,10n,head,async()=>null))
await assert.rejects(shared('e',0n,10n,head,range),CheckpointRecoveryPending)
release();await Promise.all([...tasks,...extra]);assert.equal(calls,4)
const limited=createCheckpointRecoveryScan(()=>now)
for(let i=0;i<30;i++)await limited(String(i),0n,10n,async()=>0n,async()=>null)
await assert.rejects(limited('31',0n,10n,async()=>0n,range),CheckpointRecoveryPending)
const deadline=createCheckpointRecoveryScan(()=>now,10)
await assert.rejects(deadline('timeout',0n,10n,async()=>0n,async(_f,_t,signal)=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))),CheckpointRecoveryPending)
assert.equal(checkpointRecoveryDeploymentBlock({}),null)
for(const v of ['-1','1.5','abc','0x10','10000000000000000'])assert.equal(checkpointRecoveryDeploymentBlock({CHECKPOINT_FACTORY_DEPLOYMENT_BLOCK_MAINNET:v}),null)
assert.equal(checkpointRecoveryDeploymentBlock({CHECKPOINT_FACTORY_DEPLOYMENT_BLOCK_MAINNET:' 123 '}),123n)
const source=fs.readFileSync('modules/streampay/api/content.ts','utf8')
const lookup=source.slice(source.indexOf('async function findCheckpointUnlockOnChain'),source.indexOf('export async function getContentCheckpointEscrow'))
assert.ok(!lookup.includes('fromBlock: 0n'))
assert.ok(lookup.includes("readEvmRpc('arc'"));assert.ok(lookup.includes('retryCount: 0'))
assert.ok(lookup.includes('if (failed || signal.aborted || error instanceof CheckpointVerificationUnavailable) throw error'))
const handler=source.slice(source.indexOf('export async function getCreatorCheckpointVault'),source.indexOf('export async function saveCreatorCheckpointVault'))
assert.ok(handler.indexOf('readCheckpointUnlock')<handler.indexOf('findCheckpointUnlockOnChain'))
assert.ok(handler.includes("code: 'CHECKPOINT_RECOVERY_PENDING'"))
const gate=fs.readFileSync('modules/streampay/src/components/creator/StreamGate.tsx','utf8')
assert.ok(gate.includes("if (!res.ok && res.status !== 404) throw new Error('Previous session lookup is not complete."))
console.log('Checkpoint recovery bounds, old-session continuation, failed-range retry, deduplication, quotas, timeout, negative cache, and integration guard checks passed.')
