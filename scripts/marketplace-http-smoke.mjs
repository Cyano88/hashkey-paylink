import assert from 'node:assert/strict'
import express from 'express'
import {createHmac} from 'node:crypto'
import {createMarketplaceRouter} from '../api/marketplace/http.ts'
import {createMarketplacePrincipalResolver} from '../api/marketplace/authorization.ts'
import {createMarketplaceInstructions} from '../api/marketplace/instructions.ts'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
const secret='fixture_portal_secret_longer_than_32_chars',token='hpl_live_'+'a'.repeat(48),projectId='dev_12345678'
let enabled=false,revoked=false,store={books:[],drafts:[]},calls=0
const auth=createMarketplacePrincipalResolver({env:()=>({MARKETPLACE_INSTRUCTIONS_ENABLED:'true',MARKETPLACE_PROJECT_IDS:projectId,DEVELOPER_PORTAL_SECRET:secret}),readAccess:async()=>({requests:[{projectId,ownerId:'owner_a',status:'approved'}]}),readProjects:async()=>({projects:{[projectId]:{id:projectId,ownerId:'owner_a',accountType:'business',operationalStatus:'active',capabilities:['marketplace_payments'],businessVerification:{status:'approved'},keys:[{id:'key_a',prefix:token.slice(0,16),digest:createHmac('sha256',secret).update(token).digest('hex'),environment:'live',...(revoked?{revokedAt:'now'}:{})}]}}})})
const repo=createMarketplaceRepository({read:async()=>structuredClone(store),mutate:async fn=>{store=fn(structuredClone(store));return structuredClone(store)}})
for(const id of [projectId,'dev_99999999']){await repo.create({projectId:id,paymentId:'payment_one',network:'base',asset:'USDC',amount:'1',allocations:[{id:'seller_a',sellerId:'seller_a',beneficiaryId:'wallet_a',role:'seller',settlement:'wallet_usdc',amount:'1'}]},'draft_a');await repo.execute(id,'payment_one','fund_a',{type:'fund',network:'base',asset:'USDC',amountUnits:'1000000',evidenceId:'fixture:'+id})}
const service=createMarketplaceInstructions({repository:repo,resolvePrincipal:auth,enabled:true})
const app=express();app.use(express.json());app.use('/v1',createMarketplaceRouter({enabled:()=>enabled,authorize:auth,service:()=>{calls++;return {...service,createPayment:async()=>{throw Error('provider secret should not escape')}}}}))
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port
async function req(path,method='GET',body,key,credential=token){const r=await fetch(origin+'/v1'+path,{method,headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}}
try{
 assert.equal((await req('/payments/payment_one')).status,503);assert.equal(calls,0);enabled=true
 assert.equal((await req('/payments/payment_one','GET',null,null,'hpl_test_'+ 'a'.repeat(48))).status,401)
 let r=await req('/payments/payment_one');assert.equal(r.status,200);assert.equal(r.body.data.plan.projectId,projectId);assert.ok(!JSON.stringify(r.body).includes('fixture:'))
 const release={businessReference:'delivered_one',releases:[{allocationId:'seller_a',amount:'0.1'}]}
 assert.equal((await req('/payments/payment_one/releases','POST',release)).status,400)
 assert.equal((await req('/payments/payment_one/releases','POST',{...release,projectId:'dev_99999999'},'release_a')).status,400)
 assert.equal((await req('/payments/payment_one/releases','POST',release,'release_a')).status,200)
 assert.equal((await req('/payments/payment_one/releases','POST',release,'release_a')).status,200)
 assert.equal(store.books[0].balances[0].available,'100000');assert.equal(store.books[1].balances[0].available,'0')
 assert.equal((await req('/payments/payment_one/releases','POST',{...release,releases:[{allocationId:'seller_a',amount:'0.2'}]},'release_a')).status,409)
 revoked=true;assert.equal((await req('/payments/payment_one')).status,403);revoked=false
 assert.equal((await req('/ledger/result','POST',{},'result_a')).status,404)
 r=await req('/payments','POST',{},'create_a');assert.equal(r.status,503);assert.ok(!JSON.stringify(r.body).includes('provider secret'))
}finally{await new Promise(r=>server.close(r))}
console.log('PASS HTTP gate, live key auth/revocation, scoped reads, forbidden project overrides, idempotency/conflict, allocation isolation and sanitized provider errors. Local HTTP fixtures only.')
