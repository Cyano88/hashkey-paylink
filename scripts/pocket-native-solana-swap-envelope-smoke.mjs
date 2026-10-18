import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {inspectNativeSolanaSwapEnvelope as inspect} from '../api/pocket/native-solana-swap-envelope.ts'
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/native-solana-swap-envelopes.json',import.meta.url)))
const policy={tokenAccountRentLamports:'1855569',maximumPriorityFeeLamports:'100000'}
const ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
for(const {input,instructions} of fixtures){
 const foreign=i=>i.programId===ATA&&i.accounts[2].pubkey!==input.wallet
 if(instructions.some(foreign))assert.throws(()=>inspect(input,instructions,policy),'third-party account rent must be rejected')
 // Removing foreign setup is a test variant, not an executable provider quote.
 const own=instructions.filter(i=>!foreign(i))
 const result=inspect(input,own,policy)
 assert.equal(result.executionAvailable,false);assert.equal(result.requiresSimulation,true)
 assert.equal(result.temporaryRentLamports,policy.tokenAccountRentLamports)
 const heap={programId:'ComputeBudget111111111111111111111111111111',accounts:[],data:Buffer.from([1,0,0,1,0,0,0,0,0]).toString('base64')}
 inspect(input,[heap,...own],policy)
 assert.throws(()=>inspect(input,[heap,heap,...own],policy))
 const badHeap={...heap,data:Buffer.from([1,1,0,1,0]).toString('base64')};assert.throws(()=>inspect(input,[badHeap,...own],policy))
 assert.throws(()=>inspect(input,own,{...policy,tokenAccountRentLamports:'1855570'}))
 assert.throws(()=>inspect(input,own,{...policy,maximumPriorityFeeLamports:'0'}))
 const transfer=own.find(i=>i.programId==='11111111111111111111111111111111')
 const create=own.find(i=>Buffer.from(i.data,'base64').subarray(0,8).toString('hex')==='93f17b64f484ae76')
 for(const target of [transfer,create]){
  const changed=structuredClone(own);const i=changed[own.indexOf(target)];i.accounts[0].pubkey='11111111111111111111111111111112';assert.throws(()=>inspect(input,changed,policy))
  assert.throws(()=>inspect(input,own.filter(i=>i!==target),policy))
  assert.throws(()=>inspect(input,[...own,target],policy))
 }
 const extra=structuredClone(transfer);extra.accounts[1].pubkey=input.wallet
 assert.throws(()=>inspect(input,[...own,extra],policy))
 const routerIndex=own.findIndex(i=>Buffer.from(i.data,'base64').subarray(0,8).toString('hex')==='aa2955b184501f35')
 for(const offset of [7,3,1]){
  const changed=structuredClone(own),bytes=Buffer.from(changed[routerIndex].data,'base64')
  if(offset===1)bytes[bytes.length-1]=101
  else bytes[bytes.length-offset]^=1
  changed[routerIndex].data=bytes.toString('base64');assert.throws(()=>inspect(input,changed,policy))
 }
 assert.throws(()=>inspect(input,[own[1],own[1],...own.slice(2)],policy))
 const close=own.find(i=>i.programId==='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
 if(close){
  assert.throws(()=>inspect(input,own.filter(i=>i!==close),policy))
  const changed=structuredClone(own);changed.at(-1).accounts[1].pubkey='11111111111111111111111111111112';assert.throws(()=>inspect(input,changed,policy))
 }
 console.log('PASS',input.from+'->'+input.to,'setup, rent, priority cap, cleanup and mutation rejection')
}
