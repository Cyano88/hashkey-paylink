import assert from 'node:assert/strict'
import {IncomingMessage} from 'node:http'
import {Socket} from 'node:net'
import {forwardPocketRequest} from '../api/pocket/forward-request.ts'
const req=new IncomingMessage(new Socket())
req.headers={authorization:'Bearer test-only',host:'pocket.example'};req.method='POST';req.body={original:true}
const forwarded=forwardPocketRequest(req,{action:'createOfframpOrder'})
assert.equal(({...req}).headers,undefined,'Reproduce the inherited-header loss')
assert.equal(forwarded.headers.authorization,'Bearer test-only')
assert.equal(forwarded.headers.host,'pocket.example')
assert.equal(forwarded.body.action,'createOfframpOrder')
assert.deepEqual(req.body,{original:true})
assert.equal(forwarded.socket,req.socket)
assert.equal(forwarded.method,'POST')
console.log('Internal payout requests retain inherited authentication headers without changing the original body.')
