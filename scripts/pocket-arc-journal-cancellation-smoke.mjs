import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const dir=await mkdtemp(join(tmpdir(),'pocket-arc-journal-'))
process.env.CIRCLE_POCKET_ACTION_STORE=join(dir,'actions.json')
const {recordCirclePocketAction:write,claimCirclePocketAction:claim}=await import('../api/circle-pocket-action-journal.ts')
const base={ownerId:'fixture',idempotencyKey:'q1',action:'wallet.swap',metadata:{challengeId:'challenge',intentFingerprint:'pair-amount'}}
try{
 await write({...base,status:'submitted'})
 await write({...base,status:'cancelled'})
 assert.equal((await write({...base,status:'submitted'})).status,'cancelled','stale draft cannot resurrect approval')
 assert.equal((await claim({...base,dedupe:{metadataKey:'intentFingerprint',metadataValue:'pair-amount',statuses:['started','submitted']}})).claimed,false,'same quote cannot replay')
 assert.equal((await claim({...base,idempotencyKey:'q2',dedupe:{metadataKey:'intentFingerprint',metadataValue:'pair-amount',statuses:['started','submitted']}})).claimed,true,'fresh quote allowed after cancellation')
 const transaction={...base,metadata:{...base.metadata,txHash:'0x'+'a'.repeat(64)}}
 await write({...transaction,status:'submitted'})
 assert.equal((await write({...base,status:'cancelled'})).status,'submitted','stale cancellation cannot erase transaction')
 await write({...transaction,status:'completed'})
 assert.equal((await write({...base,status:'cancelled'})).status,'completed')
 assert.equal((await write({...transaction,status:'failed'})).status,'completed')
 console.log('PASS durable Arc cancellation races, fresh quote release, replay protection and terminal evidence')
}finally{await rm(dir,{recursive:true,force:true})}
