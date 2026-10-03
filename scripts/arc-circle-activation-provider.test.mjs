import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readActivationCircleWallets} from './arc-circle-activation-provider.mjs'
import {selectActivationWallet} from './arc-circle-activation-selection.mjs'
test('authenticated inventory restores only exact linked replacement wallet',async()=>{
 const expected={walletId:'linked',address:'0xabcd'}
 const old={id:'old',address:'0x1234',blockchain:'ARC',accountType:'SCA',state:'LIVE'}
 const linked={...old,id:'linked',address:'0xabcd',refId:'pocket:evm-candidate:v2:fixture'}
 const data=await readActivationCircleWallets('LIVE_API_KEY:fixture','session-fixture',async(url,options)=>{
  assert.equal(url,'https://api.circle.com/v1/w3s/wallets?pageSize=50')
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error')
  assert.equal(options.headers['X-User-Token'],'session-fixture')
  assert.equal(options.headers.Authorization,'Bearer LIVE_API_KEY:fixture')
  return {ok:true,json:async()=>({data:{wallets:[old,linked]}})}
 })
 assert.equal(selectActivationWallet(data,expected).wallet.id,'linked')
 assert.equal(selectActivationWallet({wallets:[old]},expected).ok,false)
})
test('rejects missing session and provider rejection without a fallback',async()=>{
 let calls=0
 const denied=async()=>{calls++;return {ok:false}}
 await assert.rejects(readActivationCircleWallets('LIVE_API_KEY:fixture','',denied))
 assert.equal(calls,0)
 await assert.rejects(readActivationCircleWallets('LIVE_API_KEY:fixture','session-fixture',denied))
 assert.equal(calls,1)
})
