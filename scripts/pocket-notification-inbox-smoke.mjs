import assert from 'node:assert/strict'
import {createPocketNotificationsHandler} from '../api/pocket/notifications.ts'
const reads=[],marks=[],hydrated=[]
const deps={verifyUser:async req=>{if(!req.owner)throw Object.assign(Error('auth'),{status:401});return{userId:req.owner}},hydrate:async owner=>{hydrated.push(owner)},read:async owner=>{reads.push(owner);return[{id:'one',eventId:'one:paid',title:'Payment',readAt:undefined}]},markRead:async(owner,ids)=>{marks.push({owner,ids})}}
const call=async(handler,req)=>{const res={code:200,setHeader(){},status(n){this.code=n;return this},json(body){this.body=body;return this}};await handler(req,res);return res}
const handler=createPocketNotificationsHandler(deps)
assert.equal((await call(handler,{method:'GET'})).code,401);assert.equal(reads.length,0)
const inbox=await call(handler,{method:'GET',owner:'owner-a',query:{owner:'owner-b'}});assert.equal(inbox.body.unreadCount,1);assert.deepEqual(reads,['owner-a'])
await call(handler,{method:'POST',owner:'owner-a',body:{action:'mark-read',owner:'owner-b',ids:['one:paid']}});assert.deepEqual(marks,[{owner:'owner-a',ids:['one:paid']}])
assert.equal((await call(handler,{method:'POST',owner:'owner-a',body:{action:'mark-read',ids:new Array(201).fill('one')}})).code,400)
const partial=await call(createPocketNotificationsHandler({...deps,hydrate:async()=>{throw Error('offline')}}),{method:'GET',owner:'owner-a'});assert.equal(partial.body.partial,true);assert.equal(partial.body.notices.length,1)
console.log('PASS: notification reads and marks require authentication, ignore spoofed owners, bound updates and preserve saved inbox on refresh failure')
