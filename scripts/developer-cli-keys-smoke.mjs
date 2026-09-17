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
