import assert from 'node:assert/strict'
import {createPocketRequestRepository} from '../api/pocket/request-store.ts'
import {createPocketRequestsHandler} from '../api/pocket/requests.ts'
import {pocketRequestPaymentPath} from '../src/pocket/lib/pocketRequestPaymentPath.ts'
const id='preq_legacy_0001',address='0x'+'1'.repeat(40),payer='0x'+'2'.repeat(40)
let data={requests:{[id]:{id,eventId:'legacy_0001',senderId:'sender',recipientId:'payer',senderPocketId:'11111111',recipientPocketId:'22222222',senderName:'Sender',title:'Legacy request',amount:'1',network:'base',status:'accepted',createdAt:1,updatedAt:2}},notificationReads:{},transactionHashes:{}}
const repo=createPocketRequestRepository({durable:true,now:()=>1000,readDurable:async()=>structuredClone(data),mutateDurable:async(_key,fn)=>{data=fn(structuredClone(data))}})
let user='payer',verified=false
const handler=createPocketRequestsHandler({verifyUser:async()=>({userId:user,email:'fixture@example.test'}),profiles:{ensure:async()=>({profile:{pocketId:user==='payer'?'22222222':'11111111'}})},repository:repo,readWallet:async key=>({circleWalletAddress:key==='sender:base'?address:payer}),verifyEvm:async args=>{assert.equal(args.recipient,address);assert.equal(args.payer,payer);assert.equal(args.minAmount,'1');verified=true;return{}}})
const call=async(method,body={})=>{const res={code:200,status(n){this.code=n;return this},json(body){this.body=body;return this}};await handler({method,body},res);return res}
let r=await call('GET');assert.equal(r.body.requests[0].paymentPath,pocketRequestPaymentPath(id));assert.equal(data.requests[id].senderAddress,undefined,'GET must not mutate the request')
user='sender';assert.equal((await call('POST',{action:'prepare-payment',id})).code,409)
user='payer';r=await call('POST',{action:'prepare-payment',id,senderAddress:'0x'+'9'.repeat(40)});assert.equal(r.code,200);assert.equal(r.body.request.recipientAddress,address);assert.equal(data.requests[id].updatedAt,1000)
await repo.preparePayment('payer',id,'0x'+'9'.repeat(40));assert.equal(data.requests[id].senderAddress,address,'pinned recipient never changes')
r=await call('POST',{action:'complete',id,transactionHash:'0x'+'a'.repeat(64)});assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(verified,true);assert.equal(data.requests[id].status,'paid')
const blocked='preq_legacy_0002';data.requests[blocked]={...data.requests[id],id:blocked,status:'accepted',senderAddress:undefined,route:{phase:'submitted'}}
await assert.rejects(repo.preparePayment('payer',blocked,address),e=>e.status===409)
for(const bad of ['','../admin','https://evil.test'])assert.throws(()=>pocketRequestPaymentPath(bad))
console.log('PASS legacy route, read-only GET, owner checks, trusted wallet preparation, immutable recipient and verified completion')
