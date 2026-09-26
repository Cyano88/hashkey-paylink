import assert from 'node:assert/strict'
import { createPocketBankWithdrawHandler } from '../api/pocket/bank-withdraw.ts'
const recipient={id:'owned',bankCode:'test',bankName:'Test bank',accountNumber:'0000000001',accountName:'Test Recipient',lastUsedAt:1}
let records=[],writes=0,owner='owner-a'
const handler=createPocketBankWithdrawHandler({verifyUser:async()=>({userId:owner,email:'test@example.invalid'}),listRecipients:async user=>user==='owner-a'?[recipient]:[],listActions:async(user)=>records.filter(r=>r.ownerId===user),recordAction:async record=>{writes++;records=[{...record}];return record}})
async function call(body){const response={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(value){this.body=value;return this}};await handler({method:'POST',body,headers:{}},response);return response}
let result=await call({action:'recipients'});assert.equal(result.body.data.length,1);assert.equal(result.headers['Cache-Control'],'no-store');assert.equal(result.body.data[0].favourite,false)
result=await call({action:'favouriteRecipient',recipientId:'owned',favourite:true});assert.equal(result.body.data[0].favourite,true);assert.equal(writes,1);assert.equal(JSON.stringify(records).includes('0000000001'),false)
result=await call({action:'favouriteRecipient',recipientId:'owned',favourite:false});assert.equal(result.body.data[0].favourite,false)
owner='owner-b';result=await call({action:'recipients'});assert.deepEqual(result.body.data,[]);result=await call({action:'favouriteRecipient',recipientId:'owned',favourite:true});assert.equal(result.statusCode,404);assert.equal(writes,2)
console.log('PASS recipient ownership isolation, favourite persistence, no-store and no raw account numbers in preferences. Synthetic data only.')
