import assert from 'node:assert/strict'
import {createNativeSendHandler} from '../api/pocket/native-send.ts'
import {createNativeEvmSwapHandler} from '../api/pocket/native-evm-swap.ts'
import {nativeEvmExecutionEnabled} from '../api/pocket/native-evm-gas-policy.ts'
for(const flag of [undefined,'','false','TRUE','1',' true '])assert.equal(nativeEvmExecutionEnabled(flag),false)
assert.equal(nativeEvmExecutionEnabled('true'),true)
process.env.POCKET_NATIVE_SEND_ENABLED='false'
process.env.POCKET_NATIVE_EVM_SWAP_ENABLED='false'
// Native sends have a separate owner-scoped pilot gate, covered by native-send-pilot-smoke.
for(const create of [createNativeEvmSwapHandler]){
 let writes=0,lists=0
 const handler=create({identity:async()=>({userId:'fixture'}),list:async()=>{lists++;return []},challenge:async()=>{writes++;throw Error('Sponsored provider must not run')},readLink:async()=>{throw Error('New quotes must stop before wallet/provider access')}})
 const call=async(method,body)=>{let status=200,result;await handler({method,body,headers:{}},{setHeader(){},status(s){status=s;return this},json(value){result=value;return this}});return {status,result}}
 for(const action of ['quote','execute'])assert.equal((await call('POST',{action})).status,409)
 const pending=await call('GET',{});assert.equal(pending.status,200);assert.equal(pending.result.enabled,false);assert.equal(lists,1);assert.equal(writes,0)
}
// Enablement must not bypass linked-wallet verification or contact Circle without it.
process.env.PRIVATE_RPC_URL='https://fixture.invalid'
process.env.POCKET_NATIVE_SEND_ENABLED='true'
process.env.POCKET_NATIVE_EVM_SWAP_ENABLED='true'
for(const create of [createNativeSendHandler,createNativeEvmSwapHandler]){
 let writes=0,links=0,status=200,result
 const handler=create({identity:async()=>({userId:'fixture'}),list:async()=>[],readLink:async()=>{links++;return null},challenge:async()=>{writes++;throw Error('Unlinked wallet must not submit')}})
 const response={setHeader(){},status(s){status=s;return this},json(value){result=value;return this}}
 await handler({method:'GET',headers:{}},response);assert.equal(result.enabled,true)
 await handler({method:'POST',body:{action:'quote',network:'base'},headers:{}},response)
 assert.equal(status,409);assert.equal(links,1);assert.equal(writes,0)
}
console.log('PASS native reimbursement gates: default-off, explicit opt-in, linked-wallet checks, and recovery while disabled')

// A network without a verification RPC must never advertise executable swaps.
delete process.env.PRIVATE_RPC_URL_ETHEREUM
let missing;await createNativeEvmSwapHandler({identity:async()=>({userId:'fixture'}),list:async()=>[]})({method:'GET',query:{network:'ethereum'},headers:{}},{setHeader(){},status(){return this},json(v){missing=v;return this}});assert.equal(missing.enabled,false)
console.log('PASS per-network missing RPC disables execution capability')
