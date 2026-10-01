import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve,sep} from 'node:path'
const dir=await mkdtemp(join(tmpdir(),'pocket-gift-journal-'))
if(!resolve(dir).startsWith(resolve(tmpdir())+sep))throw Error('Invalid fixture directory')
delete process.env.DATABASE_URL;delete process.env.RENDER;delete process.env.RENDER_SERVICE_ID;delete process.env.RENDER_EXTERNAL_URL
process.env.CIRCLE_POCKET_ACTION_STORE=join(dir,'actions.json')
const {recordCirclePocketAction:record}=await import('../api/circle-pocket-action-journal.ts')
try{
 const input={ownerId:'test-owner',idempotencyKey:'test-gift',action:'gift.sent',status:'completed',resourceId:'test-gift',metadata:{txHash:'test-hash',network:'base',amount:'1',giftId:'test-gift',state:'funded'}}
 const first=await record(input),same=await record(input);assert.equal(same.updatedAt,first.updatedAt)
 const refunded=await record({...input,metadata:{...input.metadata,state:'refunded',refundTxHash:'refund-hash'}})
 const stale=await record(input);assert.equal(stale.metadata.state,'refunded');assert.equal(stale.updatedAt,refunded.updatedAt)
 await assert.rejects(record({...input,metadata:{...input.metadata,amount:'2'}}))
 console.log('PASS gift journal: unchanged reconciliation preserves timestamps; late funding cannot overwrite refund; transfer binding enforced.')
}finally{await rm(dir,{recursive:true,force:true})}
