import assert from 'node:assert/strict'
import { sendQuotedSolanaPayment } from '../src/lib/solanaPaymentFees.ts'
const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}
const wallet='fixture-wallet',recipient='fixture-recipient',hash='fixture-signature',key=`pocket:solana-relay:pending:${wallet}`
const pending={fingerprint:`${wallet}:${recipient}:100`,tx:'same-signed-bytes',txHash:hash,lastValidBlockHeight:123}
store.set(key,JSON.stringify(pending));const calls=[];let confirmed=false
const original=globalThis.fetch
globalThis.fetch=async(url,init)=>{const body=JSON.parse(init.body);calls.push({url,body});assert.ok(!url.includes('build-tx'),'a retry must not build another payment');if(url.includes('solana-relay')){assert.deepEqual(body,{tx:pending.tx,lastValidBlockHeight:123});throw Error('fixture timeout after broadcast')};return Response.json({result:{value:[confirmed?{confirmationStatus:'confirmed',err:null}:null]}})}
try{
 const input={session:{wallet:{address:wallet}},recipient,amount:'100',feeQuoteToken:'expired-but-not-used-for-rebroadcast',accessToken:'fixture'}
 const first=await sendQuotedSolanaPayment(input);assert.equal(first.state,'submitted');assert.ok(store.has(key));assert.equal(first.challengeId,`relay:${hash}`)
 const second=await sendQuotedSolanaPayment(input);assert.equal(second.state,'submitted');assert.equal(calls.filter(x=>x.url.includes('solana-relay')).length,2)
 await assert.rejects(()=>sendQuotedSolanaPayment({...input,amount:'99'}),/previous Solana payment/)
 confirmed=true;const recovered=await sendQuotedSolanaPayment(input);assert.equal(recovered.state,'confirmed');assert.equal(recovered.txHash,hash);assert.equal(store.has(key),false);assert.equal(calls.filter(x=>x.url.includes('solana-relay')).length,2)
 console.log('PASS: a broadcast timeout retains identical signed bytes; retries reuse the signature; another payment is blocked until confirmation; confirmed recovery clears only the matching journal.')
}finally{globalThis.fetch=original}
