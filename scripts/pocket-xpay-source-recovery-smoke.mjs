import assert from 'node:assert/strict'
import {runStockSubmission,settleXPaySourceProof,readStockAttempts,hasStockSubmission} from '../src/pocket/lib/pocketStockSubmission.ts'
const db=new Map()
globalThis.localStorage={get length(){return db.size},key:i=>[...db.keys()][i],getItem:k=>db.get(k)||null,setItem:(k,v)=>db.set(k,v),removeItem:k=>db.delete(k)}
const key='wallet',hash='0x'+'a'.repeat(64)
await assert.rejects(()=>runStockSubmission({key,kind:'trade',xpayPaymentId:'payment',send:async()=>{throw Error('Lost response')},onPending(){},onUncertain(){}}))
assert.equal(hasStockSubmission(key),true)
settleXPaySourceProof(key,'unrelated',hash);assert.equal(hasStockSubmission(key),true)
settleXPaySourceProof(key,'payment',hash);assert.equal(hasStockSubmission(key),false)
assert.equal(readStockAttempts(key)[0].status,'confirmed')
await runStockSubmission({key,kind:'trade',xpayPaymentId:'next',send:async()=>({hash}),onPending(){},onUncertain(){}})
settleXPaySourceProof(key,'next','0x'+'b'.repeat(64));assert.equal(hasStockSubmission(key),true)
settleXPaySourceProof(key,'next',hash);assert.equal(hasStockSubmission(key),false)
console.log('PASS source recovery: only matching payment/proof clears a pending or lost-response attempt; unrelated attempts remain blocked.')
