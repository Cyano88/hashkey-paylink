import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
const url = process.env.MIGRATION_TEST_DATABASE_URL
if (!url || !['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw Error('Isolated local test database required.')
process.env.DATABASE_URL=url
const { migratedJsonStore } = await import('../api/migrated-json-store.ts')
const { queryDurablePostgres } = await import('../api/render-durable-store.ts')
const root = await mkdtemp(join(tmpdir(),'hpl-json-migration-test-'))
const path=join(root,'source.json')
const initial={agents:{one:{name:'synthetic'}}}
await writeFile(path,JSON.stringify(initial))
const key='test:migration:'+randomUUID()
const store=migratedJsonStore(key,path,()=>({agents:{}}))
const [a,b]=await Promise.all([store.read(),store.read()])
assert.deepEqual(a,initial);assert.deepEqual(b,initial)
a.agents.two={name:'new'};await store.write(a)
b.agents.one.name='stale'
await assert.rejects(store.write(b),/record changed/)
assert.deepEqual((await store.read()).agents.two,{name:'new'})
assert.deepEqual(JSON.parse(await readFile(path,'utf8')),initial)
await writeFile(path,'invalid json')
assert.equal(Object.keys((await store.read()).agents).length,2)
const latest=await store.read();latest.agents={};await store.write(latest)
assert.deepEqual(await store.read(),{agents:{}})
const corrupt=migratedJsonStore('test:migration:'+randomUUID(),path,()=>({agents:{}}))
await assert.rejects(corrupt.read(),/valid source file/)
await queryDurablePostgres('delete from render_durable_kv where store_key=$1',[key])
console.log('PASS: real Postgres concurrent initialization, stale write rejection, unchanged source, no file fallback and no resurrection of deleted records.')
process.exit(0)
