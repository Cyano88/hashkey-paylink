import assert from 'node:assert/strict'
import {createPocketBalancesHandler} from '../api/pocket/balances.ts'
const res=()=>({statusCode:200,status(n){this.statusCode=n;return this},json(body){this.body=body;return this},setHeader(){}})
let user='verified-user',called=0
const handler=createPocketBalancesHandler({verifyUser:async()=>{if(!user)throw Object.assign(Error('Unauthorized'),{status:401});return {userId:user}},readLink:async()=>null,readBalance:async()=>{throw Error('Must not touch payment balances')},readNativeBalances:async owner=>{assert.equal(owner,'verified-user');called++;return []}})
let r=res();await handler({method:'GET',query:{assets:'native',userId:'attacker'}},r);assert.equal(r.statusCode,200);assert.equal(called,1);assert.deepEqual(r.body,{ok:true,rows:[]})
user='';r=res();await handler({method:'GET',query:{assets:'native'}},r);assert.notEqual(r.statusCode,200);assert.equal(called,1)
r=res();await handler({method:'POST',query:{assets:'native'}},r);assert.equal(r.statusCode,405);assert.equal(called,1)
console.log('PASS native read route uses authenticated owner, rejects unauthenticated/mutation requests, and does not alter payment balance reads')
