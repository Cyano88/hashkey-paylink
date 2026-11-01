import assert from 'node:assert/strict'
import {dueHistoryProofs,deferHistoryProof} from '../api/pocket/history-proof-retry.ts'
let retry={};let now=1000
for(let i=0;i<12;i++){
 retry=deferHistoryProof(retry,'failed',now)
 const restored=JSON.parse(JSON.stringify(retry))
 assert.deepEqual(dueHistoryProofs(['failed','new'],restored,now),['new'])
 assert(restored.failed.nextAt-now<=900000)
 assert.deepEqual(dueHistoryProofs(['failed'],restored,restored.failed.nextAt-1),[])
 now=restored.failed.nextAt
 assert.deepEqual(dueHistoryProofs(['failed'],restored,now),['failed'])
}
assert.equal(retry.failed.nextAt,now)
assert.deepEqual(dueHistoryProofs(['a','b','c','d','e']),['a','b','c','d'])
console.log('PASS durable proof cooldown, bounded due batch, pending evidence retained and newly discovered hashes not starved')
