import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
await mkdir('.codex-temp',{recursive:true})
const output='.codex-temp/web-evm-funding-fixture.mjs'
const built=await build({entryPoints:['src/pocket/lib/pocketEvmFunding.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'circle-fixture',setup(b){b.onResolve({filter:/circleEvmEmailWallet$/},()=>({path:'circle',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export async function bridgeCircleEvmEmailWallet(input){globalThis.calls.push(input);input.onChallenge('approval');throw Error('Lost response')};export async function readCircleEvmBridgeReservation(){return globalThis.state};export async function readCircleEvmBridgeChallenge(){globalThis.legacyReads++;return {txHash:'0x'+'b'.repeat(64)}}`}))}}]})
await writeFile(output,built.outputFiles[0].text)
const {movePocketEvmFunding}=await import(pathToFileURL(process.cwd()+'/'+output))
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};globalThis.calls=[];globalThis.legacyReads=0
const input={owner:'owner@example.com',fundingKey:'bills:1',session:{chain:'base',wallet:{address:'0x'+'1'.repeat(40)}},destination:'arbitrum',destinationAddress:'0x'+'2'.repeat(40),amount:'1',privyAccessToken:'fixture',quoteToken:'fixture'}
await assert.rejects(movePocketEvmFunding(input),/saved/)
assert.match(calls[0].idempotencyKey,/^[0-9a-f-]{36}$/)
globalThis.state={managed:true,status:'pending',challengeId:'approval',reservationReleased:false}
await assert.rejects(movePocketEvmFunding(input),/saved/);assert.equal(legacyReads,0,'Managed recovery must not fall back to SDK-only hash')
globalThis.state={...state,txHash:'0x'+'a'.repeat(64)}
assert.equal(await movePocketEvmFunding(input),state.txHash);assert.equal(calls.length,1)
globalThis.state={managed:false};await assert.rejects(movePocketEvmFunding(input),/unavailable/)
assert.equal(calls.length,1)
console.log('PASS EVM funding adapter: persisted UUID, uncertain dispatch recovery, managed hash binding, no legacy fallback and no redispatch. No real SDK/provider calls.')
