import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),qs=require('qs')
// Previously threw while round-tripping attacker-controlled query parameters.
for(const options of [{plainObjects:true},{allowPrototypes:true}]){
 const parsed=qs.parse('x%5Bconstructor%5D%5BisBuffer%5D=y',options)
 assert.doesNotThrow(()=>qs.stringify(parsed))
}
assert.deepEqual(qs.parse('network=base&amount=10&tags%5B%5D=one&tags%5B%5D=two'),{network:'base',amount:'10',tags:['one','two']})
assert.equal(Object.prototype.isBuffer,undefined)
console.log('PASS qs security regression: hostile constructor.isBuffer cannot crash round-trip; ordinary query arrays preserved.')
