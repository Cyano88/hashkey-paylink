// Read-only smoke checks. Every POST is deliberately rejected locally.
import assert from 'node:assert/strict'
import {get} from 'node:http'
const origin='http://127.0.0.1:4390'
const before=await(await fetch(origin+'/status')).json()
assert.equal((await fetch(origin)).status,200)
assert.equal((await fetch(origin+'/client.js')).status,200)
const wrongHost=await new Promise((resolve,reject)=>get(origin,{headers:{host:'untrusted.invalid'}},response=>{response.resume();resolve(response.statusCode)}).on('error',reject))
assert.equal(wrongHost,403)
for(const [headers,body] of [
 [{},{action:'listWallets',chain:'arc'}],
 [{Origin:'https://untrusted.invalid'},{action:'listWallets',chain:'arc'}],
 [{Origin:origin},{action:'executeEvmPayment',chain:'arc'}],
 [{Origin:origin},{action:'initialize',chain:'arc'}],
 [{Origin:origin},{action:'listWallets',chain:'base'}],
 [{Origin:origin},{action:'requestEmailOtp',chain:'arc',email:'wrong@example.invalid'}],
 [{Origin:origin},{action:'deployEvmWallet',chain:'arc',walletId:'wrong',walletAddress:'0x0000000000000000000000000000000000000000'}],
]){
 const response=await fetch(origin+'/api/circle-solana-email',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)})
 assert.equal(response.status,403)
}
const after=await(await fetch(origin+'/status')).json()
assert.equal(after.requested,before.requested)
console.log('PASS: page, bundle, Host/Origin, action, chain, email and wallet restrictions; no activation request created.')
