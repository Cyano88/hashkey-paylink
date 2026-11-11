import assert from 'node:assert/strict'
import React from 'react'
import {create, act} from 'react-test-renderer'
import useRecovery, {hostedReceiptReference} from '../src/pocket/hooks/useHostedCheckoutRecovery.ts'
assert.equal(hostedReceiptReference({receiptId:'short',receiptUrl:'/receipt/r1.payload.full_signature'}),'r1.payload.full_signature')
assert.equal(hostedReceiptReference({receiptId:'short',receiptUrl:'https://untrusted.test/receipt/r1.payload.signature'}),'short')
assert.equal(hostedReceiptReference({receiptId:'short',receiptUrl:'/receipt/r1.payload.signature?redirect=elsewhere'}),'short')
const originalFetch=globalThis.fetch, originalTimer=globalThis.setTimeout, originalClear=globalThis.clearTimeout
let queue=[], responses=[], calls=[], paid=[]
globalThis.setTimeout=(fn,ms,...args)=>ms===3000?(queue.push(fn),fn):originalTimer(fn,ms,...args)
globalThis.clearTimeout=id=>typeof id==='function'?(queue=queue.filter(fn=>fn!==id)):originalClear(id)
globalThis.fetch=async(url,options)=>{calls.push({url,options});const next=responses.shift();if(next instanceof Error)throw next;return {ok:true,json:async()=>next}}
const good={ok:true,checkout:{id:'chk_test',status:'paid',paymentAttempt:{id:'pat_test',status:'paid',receiptId:'signed-receipt'}}}
function Harness(props){useRecovery({enabled:true,checkoutId:'chk_test',attemptId:'pat_test',onPaid:a=>paid.push(a),...props});return null}
let root
try{
  responses=[new Error('Lost confirmation response'),{...good,checkout:{...good.checkout,status:'processing'}},{...good,checkout:{...good.checkout,id:'chk_other'}},{...good,checkout:{...good.checkout,paymentAttempt:{...good.checkout.paymentAttempt,id:'pat_other'}}},{...good,checkout:{...good.checkout,paymentAttempt:{...good.checkout.paymentAttempt,receiptId:''}}},good]
  await act(async()=>{root=create(React.createElement(Harness))})
  assert.equal(paid.length,0)
  for(let i=0;i<4;i++){await act(async()=>{queue.shift()()});assert.equal(paid.length,0)}
  await act(async()=>{queue.shift()()})
  assert.equal(paid.length,1);assert.equal(queue.length,0)
  assert(calls.every(c=>c.url.includes('attempt=pat_test')&&c.options.cache==='no-store'))
  await act(async()=>root.unmount())
  let resolve
  globalThis.fetch=()=>new Promise(r=>resolve=r)
  await act(async()=>{root=create(React.createElement(Harness))})
  await act(async()=>root.unmount())
  await act(async()=>resolve({ok:true,json:async()=>good}))
  assert.equal(paid.length,1);assert.equal(queue.length,0)
  console.log('PASS lost response recovery, exact checkout/attempt binding, settlement pending, receipt proof, retry, cancellation and one-time success.')
}finally{globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer;globalThis.clearTimeout=originalClear}
