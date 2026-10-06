import assert from 'node:assert/strict'
import {createCheckoutSessionPersistence} from '../src/lib/checkoutCircleSession.ts'
const rows=new Map(),storage={getItem:k=>rows.get(k)||null,setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k),key:i=>[...rows.keys()][i]||null,get length(){return rows.size}}
const owner={userId:'payer',email:'payer@example.invalid',walletAppId:'privy-app'},wallet={id:'base-wallet',address:'0x'+'1'.repeat(40),blockchain:'BASE'},arb={...wallet,id:'arb-wallet',blockchain:'ARB'}
const original={chain:'base',appId:'circle-app',deviceId:'device',wallet,userToken:'user',refreshToken:'refresh',encryptionKey:'never-persist'}
let device='device',fail='',calls=0,resolveWrong=false,during=()=>{},duringResolve=()=>{}
const sessions=createCheckoutSessionPersistence({storage:()=>storage,identity:async()=>({appId:'circle-app',deviceId:device}),refresh:async s=>{calls++;assert.equal(s.encryptionKey,'');during();if(fail)throw Error(fail);return{...s,userToken:'user-'+calls,refreshToken:'refresh-'+calls,encryptionKey:'renewed'}},resolve:async(s,token,chain,w)=>{duringResolve();return {...s,chain,wallet:resolveWrong?{...w,id:'wrong'}:w}}})
sessions.save(owner,original);assert.equal(rows.size,1);assert.ok(![...rows.values()][0].includes('encryptionKey'));assert.ok(![...rows.values()][0].includes('never-persist'))
assert.equal((await sessions.restore(owner,'auth','base',wallet,()=>true)).encryptionKey,'renewed')
assert.equal((await sessions.restore(owner,'auth','arbitrum',arb,()=>true)).wallet.id,'arb-wallet');assert.equal(rows.size,1,'Networks share the rotated renewal record')
assert.equal((await sessions.restore(owner,'auth','base',wallet,()=>true)).wallet.id,'base-wallet')
assert.equal(await sessions.restore({...owner,userId:'receiver'},'auth','base',wallet,()=>true),undefined)
fail='temporary network failure';await assert.rejects(sessions.restore(owner,'auth','base',wallet,()=>true),/temporary/);assert.equal(rows.size,1)
fail='refresh token expired HTTP 401';assert.equal(await sessions.restore(owner,'auth','base',wallet,()=>true),undefined);assert.equal(rows.size,0)
fail='';sessions.save(owner,original);device='other-device';assert.equal(await sessions.restore(owner,'auth','base',wallet,()=>true),undefined);assert.equal(rows.size,0)
device='device';sessions.save(owner,original);resolveWrong=true;await assert.rejects(sessions.restore(owner,'auth','base',wallet,()=>true),/does not match/)
resolveWrong=false;sessions.save(owner,original);during=()=>sessions.clear(owner);assert.equal(await sessions.restore(owner,'auth','base',wallet,()=>true),undefined);assert.equal(rows.size,0,'Logout wins over renewal')
console.log('PASS checkout renewal: no stored encryption key, cross-network refresh rotation, owner/device isolation, expiry, outage retention, wallet binding and logout race.')

during=()=>{};sessions.save(owner,original);duringResolve=()=>sessions.clear(owner);assert.equal(await sessions.restore(owner,'auth','base',wallet,()=>true),undefined);assert.equal(rows.size,0,'Logout also wins during wallet resolution')
