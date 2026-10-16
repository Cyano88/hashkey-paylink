import assert from 'node:assert/strict'
import {sendSponsoredTransfer,sponsoredTransferRequest} from '../src/pocket/api/pocketSponsoredTransfer.ts'
import {SponsoredTransferNotSubmitted} from '../src/pocket/lib/pocketSponsoredRequest.ts'
const input={owner:'0x1111111111111111111111111111111111111111',to:'0x2222222222222222222222222222222222222222',data:'0xa9059cbb',attemptId:crypto.randomUUID()},hash='0x'+'a'.repeat(64)
let sent=0,signed
const deps={getAccessToken:async()=>'fixture',assertCurrent(){},sign:async r=>{signed=r;return {signature:'fixture-signature'}},fetcher:async(url,options)=>{const b=JSON.parse(options.body);if(b.action==='prepare')return Response.json({ok:true,appId:'app',walletId:'fixturewallet'});sent++;assert.deepEqual(b.request,signed);assert.equal(b.request.headers['privy-idempotency-key'],input.attemptId);return Response.json({ok:true,hash})}}
assert.equal((await sendSponsoredTransfer(input,deps)).hash,hash);assert.equal(sent,1)
await assert.rejects(()=>sendSponsoredTransfer(input,{...deps,sign:async()=>{throw Error('cancelled')}}),SponsoredTransferNotSubmitted)
assert.equal(sent,1,'rejected signature never sends')
await assert.rejects(()=>sendSponsoredTransfer(input,{...deps,fetcher:async(url,options)=>JSON.parse(options.body).action==='prepare'?Response.json({ok:true,appId:'app',walletId:'fixturewallet'}):Promise.reject(Error('timeout'))}),e=>!(e instanceof SponsoredTransferNotSubmitted),'lost send response remains uncertain')
await assert.rejects(()=>sponsoredTransferRequest({action:'status'},async()=>null),e=>!(e instanceof SponsoredTransferNotSubmitted),'expired login never marks pending transfer failed')
await assert.rejects(()=>sponsoredTransferRequest({action:'status'},deps.getAccessToken,async()=>Response.json({ok:false,code:'pocket_sponsor_not_submitted'},{status:401})),e=>!(e instanceof SponsoredTransferNotSubmitted))
await assert.rejects(()=>sponsoredTransferRequest({action:'status'},deps.getAccessToken,async()=>Response.json({ok:false,code:'pocket_sponsor_not_submitted'},{status:422})),SponsoredTransferNotSubmitted)
console.log('PASS signed relay payload, stable attempt ID, rejection, lost response and auth-safe recovery')
const storage=new Map()
globalThis.localStorage={get length(){return storage.size},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}
const {runStockSubmission,readStockAttempts,reconcileSponsoredStockAttempt,hasStockSubmission}=await import('../src/pocket/lib/pocketStockSubmission.ts')
const key='fixture-owner'
await assert.rejects(()=>runStockSubmission({key,kind:'send',sponsored:true,send:async()=>{throw Error('lost response')},onPending(){},onUncertain(){}}))
const pending=readStockAttempts(key)[0]
assert.equal(pending.relay,'privy');assert.equal(hasStockSubmission(key),true)
assert.equal(reconcileSponsoredStockAttempt(pending,{hash}).hash,hash)
assert.equal(readStockAttempts(key)[0].hash,hash)
assert.equal(reconcileSponsoredStockAttempt(pending,{notSubmitted:true}),undefined,'stale failure cannot overwrite a recovered hash')
storage.clear()
await assert.rejects(()=>runStockSubmission({key,kind:'send',sponsored:true,send:async()=>{throw new SponsoredTransferNotSubmitted('rejected')},onPending(){},onUncertain(){}}))
assert.equal(readStockAttempts(key)[0].status,'failed');assert.equal(hasStockSubmission(key),false)
console.log('PASS durable client recovery, late hash, stale status protection and definite rejection')
const earn={action:'deposit',symbol:'USDC',amount:'1'}
const purposes=[]
assert.equal((await sendSponsoredTransfer({...input,earn},{...deps,fetcher:async(url,options)=>{const b=JSON.parse(options.body);purposes.push(b);return b.action==='prepare'?Response.json({ok:true,appId:'app',walletId:'fixturewallet'}):Response.json({ok:true,hash})}})).hash,hash)
assert.ok(purposes.every(b=>b.purpose==='earn'&&JSON.stringify(b.intent)===JSON.stringify(earn)))
assert.equal(purposes[1].request.headers['privy-idempotency-key'],input.attemptId)
console.log('PASS Earn intent preserved through preparation, user signature and relay submission')
