import assert from 'node:assert/strict'
import {createArcTradeSessionPersistence} from '../src/lib/arcTradeSessionPersistence.ts'
const owner={userId:'did:privy:fixture',email:'fixture@example.invalid',walletAppId:'privy-fixture'}
const session={chain:'arc',appId:'circle-fixture',deviceId:'device-fixture',wallet:{id:'wallet-fixture',address:'0x'+'1'.repeat(40),blockchain:'ARC'},userToken:'user-0',refreshToken:'refresh-0',encryptionKey:'must-not-be-stored'}
const rows=new Map(),storage={getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)}
let calls=0,resolves=0,fail='',during=()=>{},identity={appId:session.appId,deviceId:session.deviceId}
const store=createArcTradeSessionPersistence({storage:()=>storage,identity:async()=>identity,refresh:async s=>{calls++;during();if(fail)throw Error(fail);assert.equal(s.encryptionKey,'');return {...s,userToken:'user-'+calls,refreshToken:'refresh-'+calls,encryptionKey:'fresh-key'}},resolve:async s=>{resolves++;return s}})
store.save(owner,session)
assert.ok(![...rows.values()][0].includes('encryptionKey'))
assert.ok(![...rows.values()][0].includes('must-not-be-stored'))
assert.equal((await store.restore(owner,'auth',()=>true,session.wallet)).encryptionKey,'fresh-key')
assert.equal(calls,1);assert.equal(resolves,1)
assert.ok([...rows.values()][0].includes('refresh-1'))
assert.equal(await store.restore({...owner,userId:'other'},'auth',()=>true),undefined)
assert.equal(calls,1)
store.save(owner,session);identity={...identity,deviceId:'different'}
assert.equal(await store.restore(owner,'auth',()=>true),undefined);assert.equal(rows.size,0)
identity={appId:session.appId,deviceId:session.deviceId}
store.save(owner,session)
assert.equal(await store.restore(owner,'auth',()=>true,{address:'0x'+'2'.repeat(40)}),undefined);assert.equal(rows.size,0)
store.save(owner,session);fail='Temporary provider failure'
await assert.rejects(store.restore(owner,'auth',()=>true),/Temporary/);assert.equal(rows.size,1)
fail='refresh token expired HTTP 401'
assert.equal(await store.restore(owner,'auth',()=>true),undefined);assert.equal(rows.size,0)
fail='';store.save(owner,session);during=()=>store.clear(owner)
assert.equal(await store.restore(owner,'auth',()=>true),undefined);assert.equal(rows.size,0,'Logout wins over an in-flight refresh')
during=()=>{};store.save(owner,session)
const before=calls;await Promise.all([store.restore(owner,'auth',()=>true),store.restore(owner,'auth',()=>true)])
assert.equal(calls,before+2);assert.ok([...rows.values()][0].includes('refresh-'+calls))
let active=true;during=()=>{active=false};store.save(owner,session)
assert.equal(await store.restore(owner,'auth',()=>active),undefined)
assert.ok([...rows.values()][0].includes('refresh-'+calls),'Navigation must preserve rotated renewal credentials')
store.clear(owner);assert.equal(rows.size,0)
console.log('PASS scoped restoration, no stored encryption key, refresh rotation, wallet/device isolation, outage retention, expiry clearing and logout/navigation races')
