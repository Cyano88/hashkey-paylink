import assert from 'node:assert/strict'
import { Connection } from '@solana/web3.js'
import handler from '../api/solana-balance.ts'
const previous=Connection.prototype.getAccountInfo
const oldError=console.error
let calls=0
const logs=[]
Connection.prototype.getAccountInfo=async()=>{calls++;throw Error('https://rpc.invalid/private-credential-must-not-leak')}
console.error=(...args)=>logs.push(args)
async function request(accountAddress){const r={code:200,status(c){this.code=c;return this},json(b){this.body=b;return this}};await handler({method:'POST',body:{accountAddress}},r);return r}
try {
 for(const value of [0,{},[],null,'','invalid-address'])assert.equal((await request(value)).code,400)
 assert.equal(calls,0)
 const result=await request('11111111111111111111111111111111')
 assert.equal(result.code,500)
 assert.equal(result.body.error,'Solana balance query failed')
 assert.ok(!JSON.stringify([result.body,logs]).includes('private-credential'))
 console.log('Solana invalid-input and provider-error redaction checks passed without network calls.')
} finally {Connection.prototype.getAccountInfo=previous;console.error=oldError}
