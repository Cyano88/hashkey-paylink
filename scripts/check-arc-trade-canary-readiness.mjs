import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createPublicClient,http} from 'viem'
import {inspectArcTradeRelease} from '../api/trade-agreement/arc-preflight.ts'
const read=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''))
const activation=read('.codex-temp/arc-circle-seller-activation-verified.json')
const source=read('.codex-temp/arc-circle-source-binding.json')
const release=read('docs/audits/arc-trade-factory-deployment-2026-10-03.json').releaseCandidate
const wallets=read('.codex-temp/arc-circle-canary-wallets.json').wallets
assert.equal(activation.productionVerifierSupportsObservedEntryPoint,true)
const policy=activation.policyCandidate
assert.equal(policy.entryPointVersion,'0.7')
for(const [address,hash] of [[policy.walletImplementation,policy.walletImplementationRuntimeHash],[policy.entryPoint,policy.entryPointRuntimeHash]]){
 const record=source.records.find(r=>r.address.toLowerCase()===address.toLowerCase())
 assert.equal(record?.explorerFullyVerified,true);assert.equal(record.runtimeHash,hash)
}
const result=await inspectArcTradeRelease({manifest:{release,executionPolicy:policy},wallets:['buyer','seller'].map(role=>wallets.find(w=>w.role===role).address),reader:()=>createPublicClient({transport:http('https://rpc.mainnet.arc.io',{timeout:15000,retryCount:1})})})
writeFileSync('.codex-temp/arc-trade-canary-readiness.json',JSON.stringify({checkedAt:new Date().toISOString(),...result},null,2)+'\n')
console.log(JSON.stringify(result))
if(!result.checksPassed)process.exitCode=1
