import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve,relative} from 'node:path'
const root=resolve(tmpdir()),dir=await mkdtemp(join(root,'pocket-operation-journal-'))
process.env.CIRCLE_POCKET_ACTION_STORE=join(dir,'actions.json')
const {claimCirclePocketAction,recordCirclePocketAction}=await import('../api/circle-pocket-action-journal.ts')
const claim=(id,amount,ownerId='fixture')=>claimCirclePocketAction({ownerId,idempotencyKey:id,action:'wallet.usdt-bridge',metadata:{walletAddress:'wallet',intentFingerprint:'wallet:arbitrum:base:'+amount},dedupe:{metadataKey:'intentFingerprint',metadataValue:'wallet:arbitrum:base:'+amount,statuses:['started','submitted']}})
try{
 const twins=await Promise.all([claim('a','1000000'),claim('b','1000000')])
 assert.equal(twins.filter(r=>r.claimed).length,1,'Concurrent identical transfers have one owner')
 assert.equal((await claim('different','2000000')).claimed,true,'A different transfer is not wallet-wide blocked')
 assert.equal((await claim('other-owner','1000000','other')).claimed,true)
 const first=twins.find(r=>r.claimed).record
 await recordCirclePocketAction({...first,status:'failed'})
 assert.equal((await claim('new-attempt','1000000')).claimed,true,'A terminal failure permits a fresh transfer')
 console.log('PASS operation duplicate protection: same intent atomic, different transfer allowed, account isolation, failed retry')
}finally{assert.ok(!relative(root,resolve(dir)).startsWith('..')&&resolve(dir)!==root);await rm(dir,{recursive:true,force:true})}
