import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { archiveDiskSnapshot, collectDiskSnapshot } from './render-disk-migration.mjs'
const root = await mkdtemp(join(tmpdir(),'hpl-disk-migration-test-'))
await mkdir(join(root,'sessions'))
await writeFile(join(root,'records.json'),JSON.stringify({records:{test:'synthetic'}}))
await writeFile(join(root,'sessions','synthetic.bin'),Buffer.from([0,255,12,10]))
const original = await readFile(join(root,'records.json'))
function database({corrupt=false,change=false}={}) {
 const rows=[]; const commands=[]
 return {commands,async query(sql,args){commands.push(sql)
  if(sql.startsWith('insert into render_disk_migration_files')) rows.push({relative_path:args[1],content:Buffer.from(args[2]),digest:args[3]})
  if(sql.startsWith('select relative_path')) {
   if(corrupt) rows[0].content=Buffer.from('corrupted')
   if(change) await writeFile(join(root,'new-record.json'),'{}')
   return {rows}
  }
  return {rows:[]}
 }}
}
const good=database()
const result=await archiveDiskSnapshot(good,root)
assert.equal(result.files,2);assert.equal(result.verified,true);assert.equal(result.runtimeCutover,false)
assert.equal(good.commands.at(-1),'commit')
assert.deepEqual(await readFile(join(root,'records.json')),original)
const corrupt=database({corrupt:true})
await assert.rejects(archiveDiskSnapshot(corrupt,root),/byte verification/)
assert.equal(corrupt.commands.at(-1),'rollback')
const changed=database({change:true})
await assert.rejects(archiveDiskSnapshot(changed,root),/Source changed/)
assert.equal(changed.commands.at(-1),'rollback')
assert.equal((await collectDiskSnapshot(root)).files.length,3)
console.log('PASS: byte-exact archive, corruption rollback, concurrent source change rollback, original files preserved; synthetic records only.')
