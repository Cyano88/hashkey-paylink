import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const dir=await mkdtemp(join(tmpdir(),'pocket-bridge-journal-'))
process.env.CIRCLE_POCKET_ACTION_STORE=join(dir,'actions.json')
const { recordCirclePocketAction, listCirclePocketActions }=await import('../api/circle-pocket-action-journal.ts')
try {
 const input={ownerId:'fixture-a',idempotencyKey:'fixture-bridge',action:'wallet.bridge',metadata:{source:'base',destination:'arc',amount:'1',txHash:'fixture-hash'}}
 const first=await recordCirclePocketAction({...input,status:'submitted'})
 const retry=await recordCirclePocketAction({...input,status:'submitted'})
 assert.equal(retry.updatedAt,first.updatedAt)
 const complete=await recordCirclePocketAction({...input,status:'completed'})
 const late=await recordCirclePocketAction({...input,status:'submitted'})
 assert.equal(late.status,'completed')
 assert.equal(late.updatedAt,complete.updatedAt)
 await assert.rejects(()=>recordCirclePocketAction({...input,status:'completed',metadata:{...input.metadata,amount:'99'}}),/do not match/)
 await recordCirclePocketAction({...input,ownerId:'fixture-b',status:'submitted'})
 assert.equal((await listCirclePocketActions('fixture-a',500,'wallet.bridge',true)).length,0)
 assert.equal((await listCirclePocketActions('fixture-b',500,'wallet.bridge',true)).length,1)
 console.log('Pocket bridge journal retry tests passed.')
} finally { await rm(dir,{recursive:true,force:true}) }
