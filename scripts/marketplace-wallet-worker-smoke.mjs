import assert from 'node:assert/strict'
import {createMarketplaceWalletWorker} from '../api/marketplace/wallet-worker.ts'

let state={books:[{plan:{projectId:'project_a',paymentId:'payment_a'},operations:['payout_a','payout_b','payout_c'].map(id=>({id,status:'reserved'})),walletReservations:[{operationId:'payout_a'},{operationId:'payout_b'},{operationId:'payout_c'}]},{plan:{projectId:'project_b',paymentId:'payment_b'},operations:[{id:'other_payout',status:'reserved'}],walletReservations:[{operationId:'other_payout'}]}]},seen=[],events=0
const dependencies={read:async()=>structuredClone(state),mutate:async fn=>{state=fn(structuredClone(state));return structuredClone(state)},execution:{submit:async(project,payment,payout)=>{seen.push(payout);if(payout==='payout_a')throw Error('sensitive provider response');return {state:'unknown'}},recover:async()=>({state:'submitted',transactionId:'tx'}),reconcile:async()=>({state:'settled'})},webhooks:{pending:async()=>[{paymentId:'payment_a',eventId:'event_a'}],deliver:async()=>{events++;return {status:'delivered'}}}}
let worker=createMarketplaceWalletWorker(dependencies)
await assert.rejects(()=>worker.drain('project_a',0),/batch size/)
await assert.rejects(()=>createMarketplaceWalletWorker({...dependencies,execution:undefined}).drain('project_a'),/not configured/)
let result=await worker.drain('project_a',1)
assert.equal(result.results[0].status,'deferred');assert.equal(JSON.stringify(result).includes('sensitive'),false)
worker=createMarketplaceWalletWorker(dependencies)
assert.equal((await worker.drain('project_a',1)).results[0].operationId,'payout_b','restart advances past blocked item')
assert.equal((await worker.drain('project_a',1)).results[0].operationId,'payout_c')
assert.equal((await worker.drain('project_a',1)).results[0].operationId,'payout_a','bounded scan wraps for recovery')
assert.deepEqual(seen,['payout_a','payout_b','payout_c','payout_a'])
assert.equal(events,4,'blocked payout does not prevent outbox delivery')
state.books[0].walletExecutions=[{operationId:'payout_a',state:'failed'},{operationId:'payout_b',state:'settled'},{operationId:'payout_c',state:'settled'}]
assert.equal((await worker.drain('project_a')).results.length,0)
assert.equal(seen.includes('other_payout'),false)
console.log('PASS wallet worker: explicit configuration, bounded batches, durable cursor/restart, fairness, project isolation, terminal exclusion, error sanitization and independent outbox progress. No financial calls.')
