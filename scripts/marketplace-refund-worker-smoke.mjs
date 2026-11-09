import assert from 'node:assert/strict'
import {createMarketplaceRefundWorker} from '../api/marketplace/refund-worker.ts'

let state={books:[{plan:{projectId:'project_a',paymentId:'payment_a'},refundReservations:[{refundId:'refund_a'},{refundId:'refund_b'},{refundId:'refund_c'}]},{plan:{projectId:'project_b',paymentId:'payment_b'},refundReservations:[{refundId:'other_refund'}]}]},seen=[],events=0
const dependencies={read:async()=>structuredClone(state),mutate:async fn=>{state=fn(structuredClone(state));return structuredClone(state)},execution:{submit:async(project,payment,refund)=>{seen.push(refund);if(refund==='refund_a')throw Error('sensitive provider response');return {state:'unknown'}},recover:async()=>({state:'submitted',transactionId:'tx'}),reconcile:async()=>({state:'settled'})},webhooks:{pending:async()=>[{paymentId:'payment_a',eventId:'event_a'}],deliver:async()=>{events++;return {status:'delivered'}}}}
let worker=createMarketplaceRefundWorker(dependencies)
await assert.rejects(()=>worker.drain('project_a',0),/batch size/)
await assert.rejects(()=>createMarketplaceRefundWorker({...dependencies,execution:undefined}).drain('project_a'),/not configured/)
let result=await worker.drain('project_a',1)
assert.equal(result.results[0].status,'deferred');assert.equal(JSON.stringify(result).includes('sensitive'),false)
worker=createMarketplaceRefundWorker(dependencies)
assert.equal((await worker.drain('project_a',1)).results[0].refundId,'refund_b','restart advances past blocked item')
assert.equal((await worker.drain('project_a',1)).results[0].refundId,'refund_c')
assert.equal((await worker.drain('project_a',1)).results[0].refundId,'refund_a','bounded scan wraps for recovery')
assert.deepEqual(seen,['refund_a','refund_b','refund_c','refund_a'])
assert.equal(events,4,'blocked refund does not prevent outbox delivery')
state.books[0].refundExecutions=[{refundId:'refund_a',state:'failed'},{refundId:'refund_b',state:'settled'},{refundId:'refund_c',state:'settled'}]
assert.equal((await worker.drain('project_a')).results.length,0)
assert.equal(seen.includes('other_refund'),false)
console.log('PASS refund worker: explicit configuration, bounded batches, durable cursor/restart, fairness, project isolation, terminal exclusion, error sanitization and independent outbox progress. No financial calls.')
