import assert from 'node:assert/strict'
import {createBoundMarketplaceHostedCheckout,drainHostedCheckoutWebhookOutbox} from '../api/hosted-checkouts.ts'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
import {createMarketplaceCheckoutCollections} from '../api/marketplace/checkout-collections.ts'
import {createMarketplaceInstructions} from '../api/marketplace/instructions.ts'
let market,hosted,marketQueue=Promise.resolve(),hostedQueue=Promise.resolve(),ids=0,notify=0,execute=0,failBind=true,active=true,scope=true
const now=Date.parse('2026-11-09T16:00:00Z'),holding='0x'+'22'.repeat(20),bills='0x'+'33'.repeat(20)
const storage={read:async()=>structuredClone(market),mutate:fn=>{const job=marketQueue.then(()=>{market=fn(structuredClone(market||{books:[],drafts:[]}));return structuredClone(market)});marketQueue=job.catch(()=>{});return job},now:()=>now}
const repo=createMarketplaceRepository(storage)
await repo.create({projectId:'project_a',paymentId:'payment_a',network:'base',asset:'USDC',amount:'10',allocations:[{id:'allocation_a',sellerId:'seller_a',role:'seller',amount:'10',settlement:'wallet_usdc',beneficiaryId:'wallet_a'}]},'draft_a')
const adapter=createMarketplaceCheckoutCollections({...storage,enabled:true,projectIds:['project_a'],holding:{id:'holding_a',revision:'revision_a',address:holding,billsAddress:bills},verifyHolding:async()=>{},readCheckout:async id=>structuredClone(hosted?.checkouts[id]??null)})
const dependencies={hasStore:()=>true,signingSecret:()=> 'fixture-signing-secret-at-least-32-characters',createId:()=> 'chk_marketplace'+String(++ids).padStart(8,'0'),now:()=>new Date(now),read:async()=>structuredClone(hosted),mutate:async(_key,fn)=>{const job=hostedQueue.then(()=>{hosted=fn(structuredClone(hosted));return structuredClone(hosted)});hostedQueue=job.catch(()=>{});return job},notify:async()=>{assert.ok(market.books[0].collectionCheckout);notify++;return {status:'sent'}},executions:{create:async()=>{assert.ok(market.books[0].collectionCheckout);execute++;return {intent:{id:'execution_a',resourceId:'bound_checkout'}}}}}
const input={projectId:'project_a',paymentId:'payment_a',amount:'10',holdingAddress:holding,holdingId:'holding_a',holdingRevision:'revision_a',merchantName:'Marketplace Example',title:'Order A',returnUrl:'https://market.example/orders/a',allowedOrigins:['https://market.example']}
const service=createMarketplaceInstructions({enabled:true,repository:repo,resolvePrincipal:async credential=>credential==='valid'&&active?{projectId:'project_a',credentialId:'key_a',active:true,capabilities:['marketplace_payments'],scopes:scope?['marketplace:create']:[]}:null,createCheckout:async(projectId,paymentId,presentation)=>{assert.equal(projectId,'project_a');assert.equal(paymentId,'payment_a');return createBoundMarketplaceHostedCheckout({...input,...presentation},async id=>{if(failBind)throw Error('Binding unavailable');return adapter.bind(projectId,paymentId,id)},dependencies)}})
const body={paymentId:'payment_a',title:input.title,returnUrl:input.returnUrl}
await assert.rejects(()=>service.createCheckout('invalid',body),/denied/);assert.equal(ids,0)
scope=false;await assert.rejects(()=>service.createCheckout('valid',body),/denied/);scope=true
await assert.rejects(()=>service.createCheckout('valid',{...body,holdingAddress:bills}),/Unexpected/)
await assert.rejects(()=>service.createCheckout('valid',{...body,projectId:'project_b'}),/Unexpected/)
await assert.rejects(()=>service.createCheckout('valid',{...body,returnUrl:'https://attacker.example/return'}),/allowlisted/);assert.equal(ids,0)
await assert.rejects(()=>service.createCheckout('valid',body),/Binding unavailable/)
assert.equal(ids,1);assert.equal(execute,0);assert.equal(notify,0);assert.equal(hosted.outbox?.length??0,0)
failBind=false
const results=await Promise.all([service.createCheckout('valid',body),service.createCheckout('valid',body)])
assert.equal(results[0].checkoutId,results[1].checkoutId);assert.equal(ids,1);assert.equal(hosted.outbox.length,1)
assert.equal(market.books[0].collectionCheckout.checkoutId,results[0].checkoutId)
assert.ok(results[0].checkoutUrl.includes(results[0].checkoutId));assert.equal(results[0].holdingAddress,undefined)
const record=hosted.checkouts[results[0].checkoutId];assert.equal(record.recipient,holding);assert.equal(record.amount,'10');assert.equal(record.network,'base');assert.equal(record.environment,'live');assert.equal(record.flexible,false)
await drainHostedCheckoutWebhookOutbox(dependencies)
await assert.rejects(()=>service.createCheckout('valid',{...body,title:'changed order'}),/conflicts/)
active=false;await assert.rejects(()=>service.createCheckout('valid',body),/denied/)
const later={...dependencies,now:()=>new Date(now+16*60000)}
await assert.rejects(()=>createBoundMarketplaceHostedCheckout(input,async()=>{},later),/expired/)
assert.equal(ids,1)
console.log('PASS Marketplace checkout creation: authenticated project/create scope, strict request fields, server-owned amount/routing, allowlisted return URL, failure before URL/webhook/execution, same-checkout recovery, atomic concurrent creation and request conflict/expiry/revocation.')
