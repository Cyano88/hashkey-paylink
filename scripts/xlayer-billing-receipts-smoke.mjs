import assert from 'node:assert/strict'
import {createBillingReceiptReader} from '../api/pocket/xlayer-billing-receipts.ts'
let now=0,receiptCalls=0,blockCalls=0,offline=false,reorg=false,missing=false
const hash='0x'+'a'.repeat(64),second='0x'+'b'.repeat(64),blockHash='0x'+'c'.repeat(64)
const rpc=async(method,params)=>{
 if(method==='eth_getTransactionReceipt'){receiptCalls++;return missing?null:{transactionHash:params[0],blockNumber:'0x1',blockHash,status:'0x1',logs:[]}}
 if(method==='eth_getBlockByNumber'){blockCalls++;if(offline)throw Error('offline');return {hash:reorg?'0x'+'d'.repeat(64):blockHash}}
 throw Error(method)
}
const reader=createBillingReceiptReader(()=>now,2,100)
let audit=reader(rpc)
const receipts=await Promise.all([audit(hash),audit(second)])
assert.equal(receiptCalls,2);assert.equal(blockCalls,1,'same-block reads coalesce within an audit')
receipts[0].status='0x0'
audit=reader(rpc);assert.equal((await audit(hash)).status,'0x1');await audit(second)
assert.equal(receiptCalls,2);assert.equal(blockCalls,2,'cached receipts still require a fresh canonical block')
reorg=true;await assert.rejects(()=>reader(rpc)(hash),/unavailable/)
reorg=false;await reader(rpc)(hash);assert.equal(receiptCalls,3,'reorg evicts receipt')
offline=true;await assert.rejects(()=>reader(rpc)(hash),/offline/)
offline=false;await reader(rpc)(hash);assert.equal(receiptCalls,4,'RPC failure evicts receipt')
now=100;await reader(rpc)(hash);assert.equal(receiptCalls,5,'fixed expiry is not extended by hits')
const third='0x'+'e'.repeat(64);await reader(rpc)(third);await reader(rpc)(second);assert.equal(receiptCalls,7,'bounded cache evicts oldest entry')
missing=true;await assert.rejects(()=>reader(rpc)('0x'+'f'.repeat(64)),/unavailable/)
missing=false;await reader(rpc)('0x'+'f'.repeat(64));assert.equal(receiptCalls,9,'missing receipts never cached')
await createBillingReceiptReader(()=>now)(rpc)(hash);assert.equal(receiptCalls,10,'restart or endpoint change starts cold')
console.log('PASS warm receipt reuse, fresh canonical blocks, per-audit coalescing, reorg/outage eviction, expiry, bounds, missing proof and restart')
