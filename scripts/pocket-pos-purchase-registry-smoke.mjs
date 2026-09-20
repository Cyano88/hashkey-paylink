import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const directory=mkdtempSync(join(tmpdir(),'pocket-pos-fixtures-'))
// Never read a configured live database or registry in this fixture-only test.
for(const name of ['DATABASE_URL','POSTGRES_URL','RENDER','RENDER_SERVICE_ID','RENDER_EXTERNAL_URL'])delete process.env[name]
process.env.DATA_PATH=directory
const wallet='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40)
const entry=(tag,overrides={})=>({eventId:'ngpos-fixture',txHash:'0x'+tag.repeat(64),chain:'base',payer:wallet,verifiedPayer:wallet,memo:'POS payment',amount:'1',ts:1,source:'ngpos',...overrides})
writeFileSync(join(directory,'event-registry.json'),JSON.stringify({'ngpos-fixture':[entry('a'),entry('b',{verifiedPayer:undefined}),entry('c',{verifiedPayer:other}),entry('d',{source:'bank-receive'})]}))
try{
 const {listRegisteredPosPurchases}=await import('../api/event-registry.ts')
 assert.deepEqual((await listRegisteredPosPurchases([wallet])).map(row=>row.txHash),['0x'+'a'.repeat(64)])
 assert.equal((await listRegisteredPosPurchases([])).length,0)
 assert.equal((await listRegisteredPosPurchases(['invalid'])).length,0)
 console.log('PASS: purchases require a verified payer matching an owned wallet; unverified, foreign, and non-POS entries excluded.')
}finally{rmSync(join(directory,'event-registry.json'));(await import('node:fs')).rmdirSync(directory)}
