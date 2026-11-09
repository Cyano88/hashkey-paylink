import assert from 'node:assert/strict'
import {createMarketplaceCollectionObserver} from '../api/marketplace/collection-observer.ts'
const books=Array.from({length:7},(_,i)=>({plan:{paymentId:'p'+i},collectionCheckout:{checkoutId:'c'+i}}))
books.push({plan:{paymentId:'final'},collectionCheckout:{checkoutId:'final'},fundingEvidence:'proof'})
const seen=[];let retry=true,unblock
const worker=createMarketplaceCollectionObserver({read:async()=>({books}),sync:async b=>{seen.push(b.plan.paymentId);if(b.plan.paymentId==='p0'&&retry)throw Error('temporary RPC error')}})
assert.deepEqual(await worker.drain(5),{skipped:false,checked:5,failed:1})
retry=false;await worker.drain(5)
assert(seen.includes('p6'));assert.equal(seen.filter(id=>id==='p0').length,2);assert(!seen.includes('final'))
const concurrent=createMarketplaceCollectionObserver({read:async()=>({books}),sync:async()=>new Promise(r=>{unblock=r})})
const first=concurrent.drain(1);await new Promise(r=>setTimeout(r,0))
assert.equal((await concurrent.drain(1)).skipped,true);unblock();await first
await assert.rejects(()=>worker.drain(0),/batch size/)
console.log('PASS collection observer: bounded fair retry after RPC failure, excludes finalized books and prevents overlapping runs.')
