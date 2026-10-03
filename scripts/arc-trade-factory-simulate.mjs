import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createPublicClient,http,getContractAddress,keccak256,parseAbi,toHex} from 'viem'
import {verifyArcTradeAuthority} from '../api/trade-agreement/arc-verification.ts'
const root=new URL('../.codex-temp/',import.meta.url)
async function main(){
 const p=JSON.parse(await readFile(new URL('arc-trade-factory-plan.json',root),'utf8'))
 const safe=JSON.parse(await readFile(new URL('../docs/audits/arc-trade-safe-deployment-2026-10-03.json',import.meta.url),'utf8'))
 assert.equal(p.chainId,5042);assert.equal(p.arbiter,safe.safe);assert.equal(safe.verified,true)
 assert.equal(p.token,'0x3600000000000000000000000000000000000000');assert.equal(p.tokenDecimals,6)
 assert.equal(keccak256(p.unsignedCreation.data),p.unsignedCreation.initCodeHash);assert(p.expectedRuntimeHash)
 const client=createPublicClient({transport:http('https://rpc.mainnet.arc.io',{timeout:15000,retryCount:1})})
 assert.equal(await client.getChainId(),5042)
 const deployer='0xaA6EE4589832Fb9FA49c27cB56CBcecf29B847c7'
 const nonce=await client.getTransactionCount({address:deployer,blockTag:'latest'})
 assert.equal(await client.getTransactionCount({address:deployer,blockTag:'pending'}),nonce,'Finish pending wallet transactions first.')
 const predictedFactory=getContractAddress({from:deployer,nonce:BigInt(nonce)})
 const candidate={policy:'trade-arc-usdc-v1',chainId:5042,factory:predictedFactory,arbiter:safe.safe,factoryRuntimeHash:p.expectedRuntimeHash,authority:{proxyRuntimeHash:safe.proxyRuntimeHash,singleton:safe.singleton.address,singletonRuntimeHash:safe.singleton.runtimeHash,owners:safe.owners,threshold:2,version:safe.version}}
 const head=await client.getBlockNumber(),blocks=[]
 for(const blockNumber of [head-5n,head]){
  const block=await client.getBlock({blockNumber});assert(block.hash);blocks.push(block)
  await verifyArcTradeAuthority(client,candidate,blockNumber)
  assert.equal(await client.readContract({address:p.token,abi:parseAbi(['function decimals() view returns(uint8)']),functionName:'decimals',blockNumber}),6)
 }
 const call={account:deployer,data:p.unsignedCreation.data,value:0n}
 const simulated=await client.call(call)
 assert.equal(keccak256(simulated.data),p.expectedRuntimeHash,'Constructor runtime differs from computed immutable runtime.')
 const gas=await client.estimateGas(call),price=await client.getGasPrice(),gasLimit=gas*120n/100n
 const maxCost=gasLimit*price;assert(maxCost<=150000000000000000n,'Estimate exceeds 0.15 USDC.')
 assert((await client.getBalance({address:deployer}))>=maxCost,'Insufficient deployment gas.')
 for(const block of blocks)assert.equal((await client.getBlock({blockNumber:block.number})).hash,block.hash)
 assert.equal(await client.getTransactionCount({address:deployer,blockTag:'pending'}),nonce,'Deployer nonce changed.')
 const report={mode:'factory',status:'simulated-unsigned-trade-factory',checkedAt:new Date().toISOString(),chainId:5042,deployer,owners:safe.owners,threshold:2,predictedSafe:safe.safe,predictedFactory,singleton:safe.singleton,proxyFactory:safe.proxyFactory,proxyRuntimeHash:safe.proxyRuntimeHash,version:safe.version,token:p.token,creationBytecodeHash:p.creationBytecodeHash,expectedRuntimeHash:p.expectedRuntimeHash,calldataHash:p.unsignedCreation.initCodeHash,transaction:{chainId:5042,from:deployer,value:'0',data:p.unsignedCreation.data,nonce:toHex(nonce)},gasEstimate:gas.toString(),maxGasCostWei:'150000000000000000',sourceSha256:p.sourceSha256,compiler:p.compiler,releaseCandidate:candidate,deployed:false,fundingEnabled:false,productionReady:false}
 await writeFile(new URL('arc-trade-factory-creation.json',root),JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify({simulated:true,predictedFactory,nonce,gasEstimate:report.gasEstimate,safeVerified:true,runtimeMatches:true,deployed:false}))
}
main().catch(error=>{console.error(error instanceof assert.AssertionError?error.message:'Factory simulation failed; no transaction submitted.');process.exitCode=1})
