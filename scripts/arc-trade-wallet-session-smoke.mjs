import assert from 'node:assert/strict'
import {resolveArcTradeWalletSession} from '../src/lib/arcTradeWalletSession.ts'
const old={id:'old',address:'0x'+'1'.repeat(40),blockchain:'ARC'},wallet={id:'active',address:'0x'+'2'.repeat(40),blockchain:'ARC'}
const session={chain:'arc',wallet:old,userToken:'fixture'}
let restores=0,links=0,linked={wallet},reads=0
const deps={read:async()=>{reads++;return linked},restore:async s=>{restores++;return {...s,wallet}},link:async input=>{links++;linked={wallet:input.wallet}}}
assert.equal((await resolveArcTradeWalletSession(session,'fixture',()=>true,deps)).wallet.id,'active')
assert.equal(restores,1);assert.equal(links,0)
await resolveArcTradeWalletSession({...session,wallet},'fixture',()=>true,deps)
assert.equal(restores,1);assert.equal(links,0)
await assert.rejects(()=>resolveArcTradeWalletSession(session,'fixture',()=>true,{...deps,restore:async s=>s}),/does not match/)
await assert.rejects(()=>resolveArcTradeWalletSession(session,'fixture',()=>true,{...deps,restore:async()=>{throw Error('ownership rejected')}}),/ownership rejected/)
assert.equal(links,0)
linked=null;await resolveArcTradeWalletSession(session,'fixture',()=>true,deps);assert.equal(links,1)
await assert.rejects(()=>resolveArcTradeWalletSession(session,'fixture',()=>false,deps),/closed/)
reads=0;await assert.rejects(()=>resolveArcTradeWalletSession(session,'fixture',()=>true,{...deps,read:async()=>++reads===1?{wallet:old}:{wallet}}),/changed/)
assert.equal(links,1)
console.log('PASS: authenticated restoration, exact linked wallet, no overwrite, ownership/mismatch/race rejection and first-wallet linking.')
