import assert from 'node:assert/strict'
import {priceBscSponsorship, createBscFeeEstimator} from '../api/pocket/bsc-fee-estimator.ts'
import {estimatePrivySponsoredBatchGas} from '../api/pocket/xlayer-sponsored-cost.ts'
const now=Date.now(), bnb={scaled8:80000000000n,observedAt:now},stable={scaled8:100000000n,observedAt:now}
const policy={providerBps:1000,providerAllowanceUsdMicros:1000n,marginBps:2500,minimumFeeUnits:10000000000000000n,maximumFeeUnits:1000000000000000000n}
assert.equal(priceBscSponsorship(100000000000000n,bnb,stable,policy,now),111250000000000000n)
assert.equal(priceBscSponsorship(100000000000000n,bnb,{...stable,scaled8:50000000n},policy,now),222500000000000000n)
assert.equal(priceBscSponsorship(1n,bnb,stable,policy,now),policy.minimumFeeUnits)
for(const mutation of [{observedAt:now-30000},{observedAt:now+5001},{scaled8:0n},{scaled8:-1n}])assert.throws(()=>priceBscSponsorship(1n,{...bnb,...mutation},stable,policy,now))
for(const change of [{providerBps:-1},{providerBps:10001},{marginBps:NaN},{providerAllowanceUsdMicros:-1n},{maximumFeeUnits:1n}])assert.throws(()=>priceBscSponsorship(1n,bnb,stable,{...policy,...change},now))
let called=[]
const rpc=async(method,params)=>{called.push(method);if(method==='eth_chainId')return '0x38';if(method==='eth_getCode')return '0xef0100d6cedde84be40893d153be9d467cd6ad37875b28';if(method==='eth_call')return '0x0';if(method==='eth_estimateUserOperationGas')return {callGasLimit:'0x186a0',verificationGasLimit:'0xc350',preVerificationGas:'0x5208'};throw Error('Unexpected RPC')}
const wallet='0x1111111111111111111111111111111111111111',calls=[{to:'0x2222222222222222222222222222222222222222',data:'0x1234',value:'0x0'}]
assert.equal((await estimatePrivySponsoredBatchGas(rpc,wallet,calls,56)).totalGas,171000n)
assert.ok(!called.includes('eth_getBalance'))
await assert.rejects(()=>estimatePrivySponsoredBatchGas(rpc,wallet,calls,196))
await assert.rejects(()=>estimatePrivySponsoredBatchGas(rpc,wallet,calls,1))
console.log('PASS BSC 18-decimal gas conversion, depeg handling, fee cap/floor, stale price rejection and chain-bound Privy batch estimation')
