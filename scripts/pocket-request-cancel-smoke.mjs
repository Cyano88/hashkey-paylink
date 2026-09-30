import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createPocketRequestRepository} from '../api/pocket/request-store.ts'
const dir=await mkdtemp(join(tmpdir(),'pocket-cancel-'))
try {
 const repo=createPocketRequestRepository({durable:false,isRender:false,storePath:join(dir,'requests.json')})
 const make=async suffix=>(await repo.create({eventId:'cancel_test_'+suffix,senderId:'owner',recipientId:'payer',senderPocketId:'11111111',recipientPocketId:'22222222',senderName:'Owner',recipientName:'Payer',senderAddress:'0x'+'1'.repeat(40),title:'Test',amount:'2',flexibleAmount:false,network:'base'})).request
 let request=await make('one')
 await assert.rejects(repo.cancel('payer',request.id),e=>e.status===403)
 await repo.cancel('owner',request.id)
 assert.equal((await repo.listFor('payer')).length,0);assert.equal((await repo.listFor('owner')).length,0)
 assert.equal(await repo.unreadCount('payer'),0);assert.equal((await repo.getFor('owner',request.id)).status,'cancelled')
 await assert.rejects(repo.decide('payer',request.id,'accept'),e=>e.status===409)
 await assert.rejects(repo.markPaid('payer',request.id,'hash'),e=>e.status===409)
 request=await make('accepted');await repo.decide('payer',request.id,'accept');await assert.rejects(repo.cancel('owner',request.id),e=>e.status===409)
 request=await make('declined');await repo.decide('payer',request.id,'decline');await assert.rejects(repo.cancel('owner',request.id),e=>e.status===409)
 request=await make('race');const result=await Promise.allSettled([repo.cancel('owner',request.id),repo.decide('payer',request.id,'accept')]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1)
 console.log('PASS creator-only cancellation, audit retention, inbox removal and atomic accept/cancel race')
}finally{await rm(dir,{recursive:true,force:true})}
