import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
const source=readFileSync(new URL('./arc-trade-canary-client.js',import.meta.url),'utf8').replace(/^import .*\n/,'')
async function fixture(){
 const elements=Object.fromEntries(['status','action','connect','refresh','escrow','transaction','role','email','wallet','terms','deadline'].map(id=>[id,{disabled:true,textContent:'',setAttribute(){}}]))
 let stage=0,fail=false,approvals=0
 const requests=[],session={userToken:'fixture',wallet:{id:'wallet',address:'0x1234'}}
 const fetch=async(path,options={})=>{
  if(path.startsWith('/expected'))return {ok:true,json:async()=>({email:'test@example.invalid',walletId:'wallet',address:'0x1234',termsHash:'fixed',fundBy:2000000000})}
  if(path.startsWith('/status')){
   if(fail)throw Error('Read unavailable')
   return {ok:true,json:async()=>({action:stage===0?'create':stage===1?'accept':null,label:stage===0?'Create unfunded escrow':'Accept terms',message:'Verified stage '+stage})}
  }
  if(path==='/challenge'){requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({challengeId:'challenge'})}}
  if(path==='/reconcile'){stage++;return {ok:true,json:async()=>({message:'Confirmed'})}}
  throw Error('Unexpected route')
 }
 const context=vm.createContext({window:{fetch},fetch:(...args)=>context.window.fetch(...args),location:{pathname:'/seller/'},document:{getElementById:id=>elements[id]},Headers,AbortSignal,Date,console,connectCircleEvmEmailWallet:async()=>session,executeCircleEvmEmailChallenge:async()=>{approvals++}})
 vm.runInContext(source,context);await new Promise(resolve=>setImmediate(resolve))
 return {elements,requests,fail:()=>{fail=true},approvals:()=>approvals}
}
test('confirmed creation enables acceptance without signing in again',async()=>{
 const f=await fixture();await f.elements.connect.onclick();assert.equal(f.elements.action.disabled,false)
 await f.elements.action.onclick();assert.equal(f.elements.action.disabled,false);assert.equal(f.elements.action.textContent,'Accept terms')
 await f.elements.action.onclick();assert.deepEqual(f.requests.map(r=>r.action),['create','accept'])
 assert.equal(f.approvals(),2);assert.equal(f.elements.action.disabled,true)
})
test('failed refresh cannot enable a stale transaction action',async()=>{
 const f=await fixture();await f.elements.connect.onclick();f.fail();await f.elements.refresh.onclick()
 assert.equal(f.elements.action.disabled,true);assert.equal(f.elements.refresh.disabled,false)
 assert.match(f.elements.status.textContent,/Read unavailable/);assert.equal(f.approvals(),0)
})
