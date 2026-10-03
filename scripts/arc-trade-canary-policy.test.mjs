import {test} from 'node:test'
import assert from 'node:assert/strict'
import {assertCanaryIntent} from './arc-trade-canary-policy.mjs'
const record={binding:{termsHash:'fixed',chainId:5042,contractTerms:{amount:'100000'}}}
const base={role:'seller',action:'create',termsHash:'fixed',userToken:'fixture'}
test('only the authorized participant can request each fixed action',()=>{
 for(const [action,role] of [['create','seller'],['accept','seller'],['approve','buyer'],['fund','buyer']]){
  assert.doesNotThrow(()=>assertCanaryIntent({...base,action,role},record))
  assert.throws(()=>assertCanaryIntent({...base,action,role:role==='buyer'?'seller':'buyer'},record))
 }
})
test('rejects changed amount, network, consent, arbitrary calls and missing session',()=>{
 for(const change of [{action:'refund'},{termsHash:'changed'},{userToken:''},{amount:'1'},{call:{to:'anything'}},{userToken:'x'.repeat(8001)}])assert.throws(()=>assertCanaryIntent({...base,...change},record))
 assert.throws(()=>assertCanaryIntent(base,{binding:{...record.binding,chainId:196}}))
 assert.throws(()=>assertCanaryIntent(base,{binding:{...record.binding,contractTerms:{amount:'100001'}}}))
})
