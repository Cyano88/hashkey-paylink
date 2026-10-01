import assert from 'node:assert/strict'
import {keccak256} from 'viem'
import {validateBaseGiftDeployment,verifyBaseGiftDeployment} from '../api/pocket/gifts/deployment.ts'
const d={network:'base',chainId:8453,escrow:'0x'+'1'.repeat(40),treasury:'0x'+'2'.repeat(40),token:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',runtimeHash:keccak256('0x6000'),deploymentBlock:'100',confirmations:2}
assert.equal(validateBaseGiftDeployment(d),d)
for(const patch of [{chainId:1},{deploymentBlock:undefined},{confirmations:1},{treasury:d.escrow},{token:d.escrow}])assert.throws(()=>validateBaseGiftDeployment({...d,...patch}))
const client={getChainId:async()=>8453,getBlockNumber:async()=>102n,getCode:async()=> '0x6000',readContract:async({functionName})=>({usdc:d.token,treasury:d.treasury,PLATFORM_FEE_BPS:25n,decimals:6}[functionName])}
assert.equal((await verifyBaseGiftDeployment(client,d)).verified,true)
await assert.rejects(verifyBaseGiftDeployment({...client,getCode:async()=> '0x6001'},d))
await assert.rejects(verifyBaseGiftDeployment({...client,getChainId:async()=>1},d))
await assert.rejects(verifyBaseGiftDeployment({...client,getBlockNumber:async()=>100n},d))
console.log('PASS Base gift manifest and read-only deployment checks: network, native USDC, treasury, code hash, fee, decimals and confirmation depth.')
