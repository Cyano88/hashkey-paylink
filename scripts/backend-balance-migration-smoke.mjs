import assert from 'node:assert/strict'
import { createEvmBalanceReader } from '../api/evm-balance.ts'
import { createPocketRecipientBalanceHandler } from '../api/pocket/recipient-balance.ts'
const address='0x1111111111111111111111111111111111111111'
const precise=9007199254740993n
let calls=0,now=0
const reader=createEvmBalanceReader(async()=>{calls++;return precise},()=>now)
assert.deepEqual(await Promise.all([reader('arc',address),reader('arc',address)]),[precise,precise]);assert.equal(calls,1)
await reader('arc',address);assert.equal(calls,1)
await reader('base',address);assert.equal(calls,2)
now=5001;await reader('arc',address);assert.equal(calls,3)
let attempts=0;const failing=createEvmBalanceReader(async()=>{if(++attempts===1)throw Error('provider private detail');return 7n})
await assert.rejects(failing('base',address));assert.equal(await failing('base',address),7n)
const deps={isValidAddress:()=>false,readBalance:async()=>{throw Error('Unexpected Solana read')},readEvmBalance:reader}
const handler=createPocketRecipientBalanceHandler(deps)
const response=()=>({code:200,status(c){this.code=c;return this},json(b){this.body=b;return this}})
for(const network of ['base','arc','arbitrum']){const res=response();await handler({method:'POST',body:{network,address}},res);assert.equal(res.code,200);assert.equal(res.body.balance,precise.toString());assert.equal(res.body.network,network)}
for(const body of [{network:'base-sepolia',address},{network:'arc',address:'invalid'}]){const res=response();await handler({method:'POST',body},res);assert.equal(res.code,400)}
console.log('Backend balance exact units, cache, deduplication, network isolation, retry and validation checks passed')
