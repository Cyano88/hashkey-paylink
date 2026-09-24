import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createScopedDeveloperKeysHandler, developerPolicyFromStore, developerGeneralProjectPolicyFromStore } from '../api/developer-projects.ts'
import { keyCommand } from '../packages/cli/src/key-management.mjs'
const secret = 'fixture-portal-secret-more-than-thirty-two-characters'
let now = Date.now(), sequence = 0
const id = 'dev_12345678'
let store = { projects: { [id]: {
  id, ownerId:'owner', ownerEmail:'fixture@example.com', name:'Fixture', website:'https://example.com',
  checkoutMode:'human', settlementMode:'usdc', settlementStatus:'ready', operationalStatus:'active',
  networks:['base'], defaultNetwork:'base', recipients:{base:'0x1111111111111111111111111111111111111111'},
  allowedOrigins:['https://example.com'], capabilities:['hosted_checkout'], keys:[], operations:[],
} } }
let grant = { id:'grant-fixture',projectId:id,ownerId:'owner',scopes:['project:read','checkout:read','checkout:create','keys:manage'] }
const handler=createScopedDeveloperKeysHandler({
  hasStore:()=>true, read:async()=>store, mutate:async(_key,update)=>(store=update(store)),
  portalSecret:()=>secret, now:()=>new Date(now), createKeyId:()=> 'key_fixture000' + ++sequence,
},async()=>grant)
async function call(body) {
  const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}
  await handler({method:'POST',headers:{authorization:'Bearer hpl_cli_'+'c'.repeat(64)},body},res)
  return res
}
let vault
const vaultStore={read:async()=>vault ? structuredClone(vault):null,write:async value=>{vault=structuredClone(value)}}
const sessionStore={read:async()=>({token:'hpl_cli_'+'c'.repeat(64),grant:{...grant,state:'approved',expiresAt:new Date(now+3600000).toISOString()}})}
const deps={sessionStore,vaultStore,fetcher:async(_url,init)=>{
  const body=JSON.parse(init.body)
  if(body.action==='create') assert.ok(vault.keys.some(key=>key.value===body.apiKey),'Secret must be persisted before request')
  const res=await call(body)
  return Response.json(res.body,{status:res.statusCode})
}}
const options={name:'Backend fixture','idempotency-key':'fixture_backend_0001',scopes:'project:read,checkout:read,checkout:create','expires-in-days':'7'}
const created=await keyCommand('keys create',options,deps)
const raw=vault.keys[0].value
assert.equal(created.secretStoredLocally,true)
assert.equal(created.key.scopes.length,3)
assert.ok(!JSON.stringify(created).includes(raw))
assert.ok(!JSON.stringify(store).includes(raw))
assert.equal((await keyCommand('keys create',options,deps)).key.id,created.key.id)
assert.equal(store.projects[id].keys.length,1)
assert.equal((await keyCommand('keys list',{},deps)).keys.length,1)
assert.equal(developerGeneralProjectPolicyFromStore(store,id,'live',secret,now),null)
assert.equal(developerPolicyFromStore(store,raw,secret),null)
assert.equal(developerPolicyFromStore(store,raw,secret,'keys:manage'),null)
assert.equal(developerPolicyFromStore(store,raw,secret,'checkout:create',now)?.partnerId,id)
assert.equal(developerPolicyFromStore(store,raw,secret,'checkout:create',now+8*86400000),null)
store.projects[id].operationalStatus='suspended'
assert.equal(developerPolicyFromStore(store,raw,secret,'checkout:create',now),null)
store.projects[id].operationalStatus='active'
const original=grant
grant={...grant,ownerId:'other'}
assert.equal((await call({action:'list'})).statusCode,404)
grant=original
const spec={action:'create',operationId:'fixture_backend_0002',name:'New',apiKey:'hpl_app_'+'a'.repeat(64),scopes:['checkout:create'],expiresInDays:31}
assert.equal((await call(spec)).statusCode,400)
grant={...grant,scopes:['keys:manage','project:read']}
assert.equal((await call({...spec,expiresInDays:1})).statusCode,400)
grant=original
assert.equal((await call({...spec,operationId:options['idempotency-key'],expiresInDays:1})).statusCode,409)
await keyCommand('keys revoke',{'key-id':created.key.id},deps)
assert.equal(developerPolicyFromStore(store,raw,secret,'checkout:create',now),null)
assert.equal(vault.keys.length,0)
assert.ok(store.projects[id].operations.some(event=>event.action==='cli_key_created'))
assert.ok(store.projects[id].operations.some(event=>event.action==='cli_key_revoked'))
grant=null
assert.equal((await call({action:'list'})).statusCode,403)
console.log('Scoped keys passed: protected creation, idempotency, no raw server storage/output, expiry, scope/owner checks, revocation and audit.')

grant=original
const legacyRaw='hpl_live_fixture_legacy_backend'
const legacyKey={id:'key_legacy0001',name:'Existing backend',prefix:legacyRaw.slice(0,18),digest:createHmac('sha256',secret).update(legacyRaw).digest('hex'),environment:'live',createdAt:new Date(now).toISOString()}
store.projects[id].keys=[legacyKey,...Array.from({length:49},(_,i)=>({...legacyKey,id:'key_revoked'+i,digest:'revoked-'+i,revokedAt:new Date(now).toISOString()}))]
assert.equal((await call({...spec,expiresInDays:1})).statusCode,201)
assert.ok(store.projects[id].keys.some(key=>key.id===legacyKey.id))
assert.equal(store.projects[id].keys.length,50)
assert.ok(developerPolicyFromStore(store,legacyRaw,secret))
assert.ok(developerGeneralProjectPolicyFromStore(store,id,'live',secret,now))
console.log('Active legacy keys survive scoped-key rotation and bounded history pruning.')

// Agreement credentials are draft-only and require an explicitly configured mainnet project.
grant={...original,scopes:['project:read','agreement:read','agreement:create','keys:manage']}
const agreementSpec={...spec,operationId:'fixture_agreement_0001',apiKey:'hpl_app_'+'b'.repeat(64),scopes:['project:read','agreement:read','agreement:create'],expiresInDays:7}
assert.equal((await call(agreementSpec)).statusCode,409)
Object.assign(store.projects[id],{networks:['arc'],defaultNetwork:'arc',arcMainnetChainId:5042,recipients:{arc:'0x1111111111111111111111111111111111111111'},capabilities:['arc_agreements'],webhookUrl:'https://example.com/webhook',webhookSecretCipher:'fixture-present'})
const agreementCreated=await call(agreementSpec)
assert.equal(agreementCreated.statusCode,201)
assert.equal(developerPolicyFromStore(store,agreementSpec.apiKey,secret,'agreement:read',now)?.partnerId,id)
assert.equal(developerPolicyFromStore(store,agreementSpec.apiKey,secret,'agreement:create',now)?.partnerId,id)
assert.equal(developerPolicyFromStore(store,agreementSpec.apiKey,secret,'checkout:create',now),null)
assert.equal(developerPolicyFromStore(store,agreementSpec.apiKey,secret,'checkout:read',now),null)
assert.equal(developerPolicyFromStore(store,agreementSpec.apiKey,secret,'keys:manage',now),null)
assert.equal(developerPolicyFromStore(store,agreementSpec.apiKey,secret,'agreement:read',now+8*86400000),null)
const {cliRequestScope}=await import('../api/developer-cli-grants.ts')
assert.equal(cliRequestScope({method:'GET',originalUrl:'/api/v2/agreements?id=agr_fixture123456'}),'agreement:read')
assert.equal(cliRequestScope({method:'POST',originalUrl:'/api/v2/agreements',body:{checkoutMode:'human'}}),'agreement:create')
for(const path of ['/api/v2/agreements/payer','/api/v2/agreements/project-payer','/api/v2/agreements/agent','/api/v2/agreements/verified-recipient'])assert.equal(cliRequestScope({method:'POST',originalUrl:path,body:{}}),null)
for(const action of ['request_release','rotate_payer_link','activate','unknown'])assert.equal(cliRequestScope({method:'POST',originalUrl:'/api/v2/agreements',body:{action}}),null)
assert.equal(cliRequestScope({method:'POST',originalUrl:'/api/v2/agreements',body:{checkoutMode:'agentic'}}),null)
assert.equal(cliRequestScope({method:'POST',originalUrl:'/api/v2/agreements?override=true',body:{}}),null)
console.log('Agreement key isolation passed: Arc mainnet setup required; no checkout, key management or signing/lifecycle routes.')

// xStocks permissions must never inherit an Arc grant or use developer keys for signing.
grant={...original,scopes:['project:read','xstocks-agreement:read','xstocks-agreement:create','keys:manage']}
const stockSpec={...spec,operationId:'fixture_xstocks_0001',apiKey:'hpl_app_'+'e'.repeat(64),scopes:['project:read','xstocks-agreement:read','xstocks-agreement:create'],expiresInDays:7}
assert.equal((await call(stockSpec)).statusCode,409,'Explicit xStocks capability required')
store.projects[id].capabilities.push('xstocks_agreements')
assert.equal((await call(stockSpec)).statusCode,201)
assert.equal(developerPolicyFromStore(store,stockSpec.apiKey,secret,'xstocks-agreement:read',now)?.partnerId,id)
assert.equal(developerPolicyFromStore(store,stockSpec.apiKey,secret,'xstocks-agreement:create',now)?.partnerId,id)
assert.equal(developerPolicyFromStore(store,agreementSpec.apiKey,secret,'xstocks-agreement:read',now),null)
assert.equal(developerPolicyFromStore(store,agreementSpec.apiKey,secret,'xstocks-agreement:create',now),null)
assert.equal(developerPolicyFromStore(store,stockSpec.apiKey,secret,'agreement:create',now),null)
assert.equal(developerPolicyFromStore(store,stockSpec.apiKey,secret,'checkout:create',now),null)
assert.equal(developerPolicyFromStore(store,stockSpec.apiKey,secret,null,now),null)
assert.equal(cliRequestScope({method:'POST',originalUrl:'/api/v2/xstocks-agreements/participant',body:{action:'prepare'}}),null)
console.log('xStocks keys passed: dedicated capability and scopes; Arc, checkout and participant signing access remain isolated.')
const stockCli=await keyCommand('keys create',{name:'Stock Agreement fixture','idempotency-key':'fixture_stock_cli_0001',scopes:'project:read,xstocks-agreement:read,xstocks-agreement:create','expires-in-days':'7'},deps)
assert.equal(stockCli.secretStoredLocally,true)
assert.ok(stockCli.key.scopes.includes('xstocks-agreement:create'))
assert.ok(!JSON.stringify(stockCli).includes(vault.keys.find(entry=>entry.operationId==='fixture_stock_cli_0001').value))
console.log('CLI xStocks key creation stores the secret locally without returning it.')

// Explicit account-link scope never grants drafting, payment or participant authority.
grant={...original,scopes:['wallet:connect','keys:manage']}
const connectionSpec={...spec,operationId:'fixture_connection_0001',apiKey:'hpl_app_'+'f'.repeat(64),scopes:['wallet:connect'],expiresInDays:7}
assert.equal((await call(connectionSpec)).statusCode,201)
assert.equal(developerPolicyFromStore(store,connectionSpec.apiKey,secret,'wallet:connect',now)?.partnerId,id)
for(const scope of ['agreement:create','xstocks-agreement:create','checkout:create',null]) assert.equal(developerPolicyFromStore(store,connectionSpec.apiKey,secret,scope,now),null)
for(const previous of [agreementSpec,stockSpec]) assert.equal(developerPolicyFromStore(store,previous.apiKey,secret,'wallet:connect',now),null)
console.log('Wallet connection scope passed: older keys cannot link accounts; connection-only keys cannot draft, pay or sign.')
