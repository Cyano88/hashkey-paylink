import assert from 'node:assert/strict'
import {checkoutSelectionPublicResult} from '../api/checkout-selection-result.ts'
for(const id of ['chk_circle123','chkb_'+'1'.repeat(24),'chkx_'+'2'.repeat(24)]){
 const parent={ok:true,selectedCheckoutId:id,selectedCheckoutUrl:'/pay/c/'+id,checkout:{id:'chks_parent',selectionCheckout:true,status:'pending',canChange:true}}
 for(const status of ['pending','processing','paid','failed','expired','refunded']){
  const child={ok:true,checkout:{id,status},payment:{private:'not forwarded'},recipient:'not forwarded'}
  const result=checkoutSelectionPublicResult(parent,child)
  assert.equal(result.status,status);assert.equal(result.checkout.status,status)
  assert.equal(result.checkout.id,parent.checkout.id);assert.equal(result.selectedCheckoutUrl,parent.selectedCheckoutUrl)
  assert.equal(result.checkout.canChange,status==='pending');assert.equal(result.payment,undefined);assert.equal(result.recipient,undefined)
 }
 assert.throws(()=>checkoutSelectionPublicResult(parent,{ok:true,checkout:{id:'another',status:'paid'}}))
 assert.throws(()=>checkoutSelectionPublicResult(parent,{ok:false,checkout:{id,status:'paid'}}))
 assert.throws(()=>checkoutSelectionPublicResult(parent,{ok:true,checkout:{id,status:'unknown'}}))
 assert.equal(checkoutSelectionPublicResult({...parent,checkout:{...parent.checkout,canChange:false}},{ok:true,checkout:{id,status:'pending'}}).checkout.canChange,false)
}
console.log('PASS parent status follows only exact verified child; terminal switching disabled; private child fields not forwarded across Circle, BNB and X Layer')
