import assert from 'node:assert/strict'
import {mkdtemp, readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const dir = await mkdtemp(join(tmpdir(), 'pocket-paylinks-'))
for (const key of ['DATABASE_URL','POSTGRES_URL','RENDER','RENDER_SERVICE_ID','RENDER_EXTERNAL_URL']) delete process.env[key]
process.env.TELEGRAM_REQUEST_STORE = join(dir, 'requests.json')
process.env.CIRCLE_POCKET_ACTION_STORE = join(dir, 'actions.json')
process.env.PUBLIC_PAYLINK_ORIGIN = 'https://checkout.example'
const {default: pocket} = await import('../api/pocket/paylink-requests.ts')
const {default: legacy} = await import('../api/telegram-request.ts')
assert.equal(pocket, legacy, 'Both endpoints must share one module and mutation queue')
async function call(handler, overrides={}) {
 let status=200, payload
 await handler({method:'POST',headers:{},query:{},body:{},protocol:'https',...overrides}, {
  status(value){status=value;return this},json(value){payload=value;return this}
 })
 return {status,payload}
}
assert.equal((await call(pocket)).status,401)
const headers={'x-helper-session':'a'.repeat(64),'idempotency-key':'pocket-paylinks-compat-0001'}
const body={wallet:'0x1111111111111111111111111111111111111111',network:'arc',mode:'group',label:'Synthetic collection',amount:'5',target:'Synthetic group'}
assert.equal((await call(pocket,{headers:{'x-helper-session':'a'.repeat(64)},body})).status,400)
assert.equal((await call(pocket,{headers,body:{...body,wallet:'invalid'}})).status,400)
const results=await Promise.all([call(pocket,{headers,body}),call(legacy,{headers,body})])
for(const result of results) assert.equal(result.status,200)
assert.equal(results[0].payload.request.id,results[1].payload.request.id)
assert.equal(results.filter(result=>result.payload.replayed).length,1)
const created=results[0].payload.request
assert.ok(created.eventId)
assert.equal(new URL(created.payUrl).searchParams.get('n'),'arc')
assert.equal('ownerId' in created,false)
assert.equal('idempotencyKey' in created,false)
for(const handler of [pocket,legacy]) {
 const loaded=await call(handler,{method:'GET',query:{id:created.id}})
 assert.equal(loaded.status,200)
 assert.deepEqual(loaded.payload.request,created)
 assert.equal((await call(handler,{method:'DELETE'})).status,405)
}
const stored=JSON.parse(await readFile(process.env.TELEGRAM_REQUEST_STORE,'utf8'))
assert.equal(Object.keys(stored.requests).length,1)
const panel=await readFile(new URL('../src/components/AgentHashPanel.tsx',import.meta.url),'utf8')
assert.ok(panel.includes("fetch(pocketApiUrl('/api/pocket/paylink-requests'), {"))
assert.ok(!panel.includes("fetch('/api/telegram-request'"))
const server=await readFile(new URL('../server.ts',import.meta.url),'utf8')
assert.match(server,/app.all\('\/api\/pocket\/paylink-requests',\s+strictLimiter, pocketPaylinkRequestsHandler\)/)
assert.match(server,/app.all\('\/api\/telegram-request',\s+strictLimiter, telegramRequestHandler\)/)
console.log('Pocket PayLinks compatibility passed: shared records, concurrent idempotency, auth, validation, native URL routing and legacy reads')
