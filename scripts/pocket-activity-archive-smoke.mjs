import assert from 'node:assert/strict'
import {createDurablePocketActivityHandler,activityFeedKey} from '../api/pocket/activity-feed.ts'
import {pocketActivityArchiveKey} from '../src/pocket/lib/pocketActivityArchive.ts'
const row=(id)=>({eventId:id,txHash:'0x'+id.repeat(64),chain:'base',payer:'fixture',memo:'fixture',amount:'1',ts:1000,source:'bank-withdraw',bankOrderId:id,providerReference:id,direction:'out',paycrestStatus:'settled'})
const records=[row('a'),row('b')],snapshot=payments=>({payments,merchants:[],collections:[]}),feeds=new Map()
for(const owner of ['owner-a','owner-b'])feeds.set(activityFeedKey(owner),{version:1,sources:{bank:{snapshot:snapshot(owner==='owner-a'?records:[row('c')]),startedAt:100000,updatedAt:100000}}})
const handler=createDurablePocketActivityHandler({now:()=>100000,verifyUser:async req=>{if(!req.owner)throw Object.assign(Error('unauthorized'),{status:401});return {userId:req.owner}},sources:{bank:async owner=>snapshot(owner==='owner-a'?records:[row('c')])},store:{read:async key=>feeds.get(key),mutate:async(key,update)=>{const value=update(feeds.get(key));feeds.set(key,value);return value}}})
const request=async(owner,method='GET',body={},query={})=>{const res={code:200,setHeader(){},status(code){this.code=code;return this},json(data){this.body=data;return this}};await handler({owner,method,body,query},res);return res}
const key=pocketActivityArchiveKey(records[0])
assert.equal((await request(undefined,'POST',{action:'archive',recordKey:key})).code,401)
assert.equal((await request('owner-b','POST',{action:'archive',recordKey:key})).code,404)
assert.equal((await request('owner-a','POST',{action:'archive',recordKey:key})).code,200)
assert.equal((await request('owner-a','GET',{}, {scope:'recent'})).body.payments.length,1)
const full=await request('owner-a','GET',{}, {refresh:'1'});assert.equal(full.body.payments.length,2);assert.ok(full.body.archivedKeys.includes(key))
assert.equal((await request('owner-a','POST',{action:'restore',recordKey:key})).code,200)
assert.equal((await request('owner-a','GET',{}, {scope:'recent'})).body.payments.length,2)
console.log('PASS archive is owner-scoped, reversible, retained across refresh and excludes recent activity without deleting records.')
