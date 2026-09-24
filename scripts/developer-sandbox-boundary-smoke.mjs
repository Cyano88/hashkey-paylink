import assert from 'node:assert/strict'
import express from 'express'
import { developerEnvironment, developerEnvironmentBoundary, assertLiveDeveloperRequest } from '../api/developer-environment.ts'
import capabilitiesHandler from '../api/developer-capabilities.ts'
import { developerCapabilities } from '../src/lib/developerCapabilities.ts'
import { createHostedCheckoutsHandler } from '../api/hosted-checkouts.ts'
import { createPolymarketFundingCheckoutsHandler } from '../api/polymarket-funding-checkouts.ts'
import { createArcAgreementsHandler } from '../api/arc-agreements.ts'
const response=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}})
assert.equal(developerEnvironment(undefined,'live'),'live')
for(const value of [null,'','sandbox','production','LIVE',' test ',['test'],{},0,false])assert.throws(()=>developerEnvironment(value,'live'),error=>error.status===400)
assert.doesNotThrow(()=>assertLiveDeveloperRequest({headers:{},body:{environment:'live'}}))
for(const request of [{body:{environment:'test'}},{query:{environment:'test'}},{headers:{'x-hashpaylink-environment':'test'}},{headers:{'x-api-key':'hpl_test_fixture'}},{headers:{authorization:'Bearer hpl_test_fixture'}}]){
 const req={method:'POST',query:{},body:{},headers:{},...request}
 for(const handler of [createHostedCheckoutsHandler({}),createPolymarketFundingCheckoutsHandler({}),createArcAgreementsHandler({hasStore:()=>{throw Error('storage must not be reached')}})]){
  const res=response();await handler(req,res);assert.ok([403,409].includes(res.statusCode),JSON.stringify(res.body))
 }
}
const testPolicy={environment:'test',capabilities:['arc_agreements','hosted_checkout','polymarket_funding'],settlementMode:'usdc'}
const deps={hasStore:()=>true,signingSecret:()=> 's'.repeat(40),policy:async()=>testPolicy,read:()=>{throw Error('No record read permitted')},mutate:()=>{throw Error('No record write permitted')}}
for(const handler of [createHostedCheckoutsHandler(deps),createPolymarketFundingCheckoutsHandler(deps),createArcAgreementsHandler(deps)]){
 const res=response();await handler({method:'POST',headers:{},query:{},body:{}},res);assert.equal(res.statusCode,403)
}
const caps=developerCapabilities()
assert.equal(caps.sandboxPaymentsEnabled,false)
assert.deepEqual(caps.products.find(p=>p.id==='agent_checkout').sandbox.networks,['base_sepolia','arc_testnet'])
assert.deepEqual(caps.products.find(p=>p.id==='arc_agreements').sandbox.networks,['arc_testnet'])
assert.deepEqual(caps.products.find(p=>p.id==='polymarket_funding').sandbox.networks,[])
for(const network of Object.values(caps.testNetworks))assert.ok(![8453,42161,5042].includes(network.chainId))
const post=response();capabilitiesHandler({method:'POST'},post);assert.equal(post.statusCode,405)
const app=express();app.use(express.json());app.all('/api/v2/capabilities',capabilitiesHandler)
let effects=0;app.use(['/api/v2/checkouts','/api/v2/agreements','/api/v2/funding'],developerEnvironmentBoundary)
app.use((_req,res)=>{effects++;res.json({ok:true})})
const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server))})
try{
 const origin='http://127.0.0.1:'+server.address().port
 for(const path of ['/api/v2/checkouts','/api/v2/checkouts/agent/pay','/api/v2/agreements/payer','/api/v2/funding/polymarket/checkouts']){
  for(const environment of ['test','sandbox',null,['live','test']]){
   const r=await fetch(origin+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({environment})});assert.ok([400,409].includes(r.status))
  }
  const duplicate=await fetch(origin+path+'?environment=live&environment=test');assert.equal(duplicate.status,400)
 }
 assert.equal(effects,0)
 const metadata=await fetch(origin+'/api/v2/capabilities');assert.equal(metadata.status,200);assert.equal((await metadata.json()).sandboxPaymentsEnabled,false);assert.equal(effects,0)
 const valid=await fetch(origin+'/api/v2/checkouts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({environment:'live'})});assert.equal(valid.status,200);assert.equal(effects,1)
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
console.log('Sandbox boundary: strict values, nested routes, duplicate selectors, no live side effects, public capabilities and product/network rules passed.')
