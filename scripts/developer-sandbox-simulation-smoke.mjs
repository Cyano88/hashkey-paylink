import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {createDeveloperSandboxHandler} from '../api/developer-sandbox.ts'
import {productionCapabilities} from '../src/lib/developerAccess.ts'
import {SANDBOX_ASSETS} from '../src/lib/developerSandbox.ts'
const stores=new Map();let owner='owner-a'
const handler=createDeveloperSandboxHandler(async()=>({userId:owner}),{read:async k=>structuredClone(stores.get(k)),mutate:async(k,fn)=>{const next=fn(structuredClone(stores.get(k)));stores.set(k,next);return next},now:()=>new Date('2026-10-30T15:00:00Z')})
async function call(body,headers={},query={}){const res={statusCode:200,status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};await handler({method:body?'POST':'GET',body,headers,query},res);return res}
assert.equal((await call()).body.payments.length,0)
const key=(await call({action:'create-key'})).body.apiKey
const headers={'x-api-key':key,'idempotency-key':'test-order-1'}
const body={action:'create-checkout',amount:'1.50',network:'base',asset:'USDC',title:'Test order',reference:'order-1'}
const created=await call(body,headers);assert.equal(created.statusCode,201);const id=created.body.checkout.id
assert.equal((await call(body,headers)).body.checkout.id,id)
assert.equal((await call({...body,amount:'2'},headers)).statusCode,409)
assert.equal((await call({...body,amount:'NaN'},{...headers,'idempotency-key':'bad-number'})).statusCode,400)
assert.equal((await call({...body,network:'base',asset:'OKB'},{...headers,'idempotency-key':'bad-asset'})).statusCode,400)
assert.equal((await call(undefined,headers,{id})).body.checkout.environment,'test')
owner='owner-b';assert.equal((await call()).body.payments.length,0)
assert.equal((await call(undefined,{}, {id})).statusCode,404);owner='owner-a'
for(const status of ['processing','paid','paid'])assert.equal((await call({action:'simulate',id,status},headers)).statusCode,200)
assert.equal((await call({action:'simulate',id,status:'failed'},headers)).statusCode,409)
const fixture=(await call({action:'webhook-fixture',id},headers)).body.fixture
const timestamp=fixture.headers['x-hashpaylink-signature'].match(/t=(\d+)/)[1]
assert.ok(fixture.headers['x-hashpaylink-signature'].endsWith(createHmac('sha256',fixture.signingSecret).update(timestamp+'.'+fixture.payload).digest('hex')))
assert.equal(JSON.parse(fixture.payload).data.simulated,true)
let n=0;for(const [network,assets] of Object.entries(SANDBOX_ASSETS))for(const asset of assets){assert.equal((await call({...body,network,asset},{...headers,'idempotency-key':'supported-'+(++n)})).statusCode,201)}
assert.equal(n,17)
for(const credential of ['hpl_live_fake','hpl_app_fake','hpl_cli_fake','hpl_test_fake'])assert.ok([401,403].includes((await call(undefined,{'x-api-key':credential})).statusCode))
for(const environment of ['live','sandbox',null,['test']])assert.equal((await call({...body,environment},headers)).statusCode,400)
assert.equal((await call({action:'create-key'},headers)).statusCode,403)
const keyId=(await call()).body.keys[0].id
assert.equal((await call({action:'revoke-key',keyId})).statusCode,200)
assert.equal((await call(undefined,headers)).statusCode,401)
assert.ok([...stores.keys()].every(k=>k.startsWith('hashpaylink:developer-sandbox:v1:')))
const project={checkoutMode:'human',settlementMode:'usdc',businessVerification:{required:true,status:'not_started'},capabilities:['hosted_checkout','polymarket_funding','swap_xlayer']}
assert.deepEqual(productionCapabilities(project),['hosted_checkout'])
assert.deepEqual(productionCapabilities({...project,settlementMode:'ngn'}),[])
assert.deepEqual(productionCapabilities({...project,settlementMode:'ugx',accountType:'individual'}),[])
assert.deepEqual(productionCapabilities({...project,settlementMode:'ngn',accountType:'individual',personalKycVerified:true}),['hosted_checkout'])
assert.deepEqual(productionCapabilities({...project,settlementMode:'ugx',accountType:'business',businessVerification:{required:false,status:'not_started'}}),[])
assert.deepEqual(productionCapabilities({...project,settlementMode:'ngn',businessVerification:{required:true,status:'approved'}}),['hosted_checkout'])
for(const override of [{operationalStatus:'suspended'},{removal:{}},{businessVerification:{required:true,status:'rejected'}},{checkoutMode:'agentic'}])assert.deepEqual(productionCapabilities({...project,...override}),[])
console.log('Sandbox: 17 asset routes, owner/key isolation, revocation, idempotency, terminal outcomes, signatures and production capability gates passed. No provider calls.')
