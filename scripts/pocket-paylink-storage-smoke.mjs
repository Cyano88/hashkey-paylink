import assert from 'node:assert/strict'
import {mkdtemp,readFile,writeFile,readdir,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createPaylinkRequestFileStore} from '../api/pocket/paylink-request-file-store.ts'
const dir=await mkdtemp(join(tmpdir(),'paylink-storage-'))
const path=join(dir,'requests.json'), store=createPaylinkRequestFileStore(path)
await Promise.all(Array.from({length:20},(_,i)=>store.mutate(s=>{s.requests[String(i)]={id:String(i)}})))
assert.equal(Object.keys((await store.read()).requests).length,20)
assert.equal((await readdir(dir)).filter(x=>x.endsWith('.tmp')).length,0)
for(const corrupt of ['{broken','null','{}','{"requests":[]}','{"requests":{"one":{"id":"two"}}}']) {
 await writeFile(path,corrupt)
 await assert.rejects(store.read(), e=>e.status===503)
 await assert.rejects(store.mutate(s=>{s.requests.new={id:'new'}}),e=>e.status===503)
 assert.equal(await readFile(path,'utf8'),corrupt)
}
await writeFile(path,JSON.stringify({requests:{existing:{id:'existing',extra:'preserved'}}}))
await store.mutate(s=>{s.requests.next={id:'next'}})
assert.equal((await store.read()).requests.existing.extra,'preserved')
const blocked=join(dir,'directory');await mkdir(blocked)
await assert.rejects(createPaylinkRequestFileStore(blocked).read(),e=>e.status===503)
console.log('PayLink storage tests passed: concurrent writes, corrupt data preservation, read failure, queue recovery and temp cleanup')
