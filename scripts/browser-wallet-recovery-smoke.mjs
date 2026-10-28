import assert from 'node:assert/strict'
import {prepareBrowserWalletSession} from '../src/lib/prepareBrowserWalletSession.ts'
import {checkoutMessage} from '../src/lib/checkoutMessage.ts'
const session={chain:'base',wallet:{id:'wallet1',address:'0x123',blockchain:'BASE'}}
const recovery=Object.assign(new Error('native session unavailable'),{name:'PocketWalletSessionRecoveryRequiredError'})
let connects=0,resolves=0,active=true
const deps={connect:async()=>{connects++;return session},resolve:async s=>{resolves++;return s}}
const props={chain:'base',email:'test@example.com',wallet:{address:'0x123',walletId:'wallet1'},getAccessToken:async()=> 'token',active:()=>active,restore:async()=>{throw recovery}}
assert.equal(await prepareBrowserWalletSession(props,deps),session)
assert.equal(connects,1)
await prepareBrowserWalletSession({...props,restore:async()=>session},deps)
assert.equal(connects,1)
await assert.rejects(prepareBrowserWalletSession({...props,restore:async()=>{throw Error('network error')}},deps),/network error/)
assert.equal(connects,1)
await assert.rejects(prepareBrowserWalletSession(props,{...deps,connect:async()=>{throw Error('Cancelled')}}),/Cancelled/)
await assert.rejects(prepareBrowserWalletSession({...props,wallet:{address:'0x999'}},deps),/could not be verified/)
active=false
await assert.rejects(prepareBrowserWalletSession(props,deps),/account changed/)
active=true
await assert.rejects(prepareBrowserWalletSession(props,{...deps,connect:async()=>{active=false;return session}}),/account changed/)
assert.equal(checkoutMessage('Your Circle wallet session needs to be reconnected before making a payment.'),'Confirm your email to continue.')
assert.equal(checkoutMessage('User rejected approval'),'Cancelled. You can continue when ready.')
assert.equal(checkoutMessage('SDK encryption failure'),'Could not continue. Please try again.')
console.log('Browser recovery: missing session, reuse, transport failure, cancellation, wallet mismatch, account changes, safe messages passed')

active=true
for(const [chain,blockchain] of [['base','BASE'],['arbitrum','ARB'],['arc','ARC'],['ethereum','ETH'],['polygon','MATIC']]){
 const target={id:chain+'-wallet',address:'0x456',blockchain}
 let resolvedChain=''
 const result=await prepareBrowserWalletSession({...props,chain,wallet:{address:target.address,walletId:target.id}}, {...deps,resolve:async(s,token,requested)=>{resolvedChain=requested;return {...s,chain:requested,wallet:target}}})
 assert.equal(resolvedChain,chain)
 assert.equal(result.wallet.id,target.id)
 await assert.rejects(prepareBrowserWalletSession({...props,chain,wallet:{address:target.address,walletId:target.id}}, {...deps,resolve:async s=>({...s,chain,wallet:{...target,id:'wrong-id'}})}),/could not be verified/)
}
console.log('All five EVM networks select the requested owned wallet; incorrect IDs rejected')
