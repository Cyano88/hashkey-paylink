import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createPocketRequestRepository} from '../api/pocket/request-store.ts'
import {createPocketRequestsHandler} from '../api/pocket/requests.ts'
const root=await mkdtemp(join(tmpdir(),'pocket-request-links-'))
const repository=createPocketRequestRepository({durable:false,isRender:false,storePath:join(root,'requests.json')})
const handler=createPocketRequestsHandler({repository,
 verifyUser:async req=>{if(!req.headers.user)throw Object.assign(Error('Sign in'),{status:401});return {userId:req.headers.user}},
 profiles:{ensure:async identity=>({profile:{privyUserId:identity.userId,pocketId:identity.userId==='owner'?'11111111':'22222222',email:'private@example.com',nameStatus:'unverified'},unchanged:true})},
 readWallet:async()=>({circleWalletAddress:'0x'+'1'.repeat(40)})})
async function call(user,method,body={},query={}){const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(value){this.body=value;return this}};await handler({method,body,query,headers:{user}},res);return res}
try{
 const input={action:'create-link',eventId:'request_link_test_0001',amount:'5',title:'Dinner',network:'base'}
 const created=await call('owner','POST',input)
 assert.equal(created.statusCode,201,JSON.stringify(created.body))
 const request=created.body.request,code=request.linkUrl.split('/').at(-1)
 assert.match(code,/^[A-Za-z0-9_-]{32}$/)
 const replay=await call('owner','POST',input)
 assert.equal(replay.body.request.linkUrl,request.linkUrl)
 const preview=await call(undefined,'GET',{}, {link:code})
 assert.equal(preview.statusCode,200);assert.equal(preview.headers['Cache-Control'],'no-store')
 assert.equal(preview.body.preview.status,'pending')
 assert.equal(JSON.stringify(preview.body).includes('private@example.com'),false)
 assert.equal(JSON.stringify(preview.body).includes('0x1111'),false)
 assert.equal((await repository.getLink(code)).recipientId,'')
 assert.equal((await call(undefined,'POST',{action:'claim-link',code})).statusCode,401)
 assert.equal((await call('owner','POST',{action:'claim-link',code})).statusCode,409)
 const outcomes=await Promise.all(['payer1','payer2'].map(user=>call(user,'POST',{action:'claim-link',code})))
 assert.deepEqual(outcomes.map(x=>x.statusCode).sort(),[200,409])
 const winner=outcomes[0].statusCode===200?'payer1':'payer2',loser=winner==='payer1'?'payer2':'payer1'
 assert.equal((await call(winner,'POST',{action:'claim-link',code})).body.request.id,request.id)
 await repository.markPaid(winner,request.id,'0x'+'a'.repeat(64))
 assert.equal((await call(loser,'POST',{action:'claim-link',code})).statusCode,409)
 assert.equal((await call(undefined,'GET',{}, {link:code})).body.preview.status,'paid')
 const second=await call('owner','POST',{...input,eventId:'request_link_test_0002'})
 const code2=second.body.request.linkUrl.split('/').at(-1)
 await repository.cancel('owner',second.body.request.id)
 assert.equal((await call(winner,'POST',{action:'claim-link',code:code2})).statusCode,409)
 assert.equal((await call(undefined,'GET',{}, {link:code2})).body.preview.status,'cancelled')
 assert.equal((await call(undefined,'GET',{}, {link:'invalid'})).statusCode,404)
 console.log('PASS request links: private preview, authentication, idempotency, concurrent claim, paid and cancelled handling; no funds moved')
}finally{await rm(root,{recursive:true,force:true})}
