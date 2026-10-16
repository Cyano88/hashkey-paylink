import assert from 'node:assert/strict'
import {matchStockSendResult} from '../src/pocket/lib/pocketStockSendResult.ts'
const hash='0x'+'1'.repeat(64),other={id:'other',key:'owner',hash:'0x'+'2'.repeat(64),kind:'send',status:'confirmed'}
const result={attemptId:'current',hash:''},pending={id:'current',key:'owner',hash:'',kind:'send',status:'pending'}
assert.equal(matchStockSendResult(result,[pending,other],other).status,'pending')
const confirmed={...pending,hash,status:'confirmed'}
assert.equal(matchStockSendResult(result,[confirmed,other],other).status,'confirmed')
assert.equal(matchStockSendResult(result,[confirmed,other],other).hash,hash)
assert.equal(matchStockSendResult(result,[other],other),null,'unrelated last success never completes this send')
assert.equal(matchStockSendResult({hash:''},[confirmed],confirmed),null)
assert.equal(matchStockSendResult({hash},[],confirmed),confirmed)
assert.equal(matchStockSendResult(result,[{...pending,status:'failed'}],other).status,'failed')
console.log('PASS late-hash success and receipt reference; exact attempt matching; unrelated success rejected; recovered failure')
