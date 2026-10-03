import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createPublicClient,http,getAddress,getContractAddress,keccak256} from 'viem'
import {verifyArcTradeFactory,verifyArcTradeAuthority} from '../api/trade-agreement/arc-verification.ts'

async function main(){
 const [planFile,hash,outputFile,...extra]=process.argv.slice(2)
 assert(planFile&&/^0x[0-9a-f]{64}$/i.test(hash)&&outputFile&&!extra.length,'Supply plan, transaction hash and output path.')
 const p=JSON.parse(await readFile(planFile,'utf8'))
 assert.equal(p.status,'simulated-unsigned-trade-factory');assert.equal(p.chainId,5042)
 assert.equal(p.releaseCandidate.factoryRuntimeHash,p.expectedRuntimeHash)
 assert.equal(getAddress(p.releaseCandidate.factory),getAddress(p.predictedFactory))
 assert.equal(getAddress(p.releaseCandidate.arbiter),getAddress(p.predictedSafe))
 const client=createPublicClient({transport:http('https://rpc.mainnet.arc.io',{timeout:15000,retryCount:1})})
 assert.equal(await client.getChainId(),5042)
 const [tx,receipt,head]=await Promise.all([client.getTransaction({hash}),client.getTransactionReceipt({hash}),client.getBlockNumber()])
 assert.equal(receipt.status,'success');assert(head>=receipt.blockNumber+5n,'Wait for five subsequent blocks.')
 assert.equal(tx.hash.toLowerCase(),hash.toLowerCase());assert.equal(receipt.transactionHash.toLowerCase(),hash.toLowerCase())
 assert.equal(tx.blockHash,receipt.blockHash);assert.equal(tx.blockNumber,receipt.blockNumber)
 assert.equal(tx.chainId,5042);assert.equal(tx.to,null);assert.equal(tx.value,0n)
 assert.equal(getAddress(tx.from),getAddress(p.deployer));assert.equal(BigInt(tx.nonce),BigInt(p.transaction.nonce))
 assert.equal(tx.input.toLowerCase(),p.transaction.data.toLowerCase());assert.equal(keccak256(tx.input),p.calldataHash)
 assert.equal(getAddress(receipt.contractAddress),getAddress(p.predictedFactory))
 assert.equal(getAddress(getContractAddress({from:tx.from,nonce:BigInt(tx.nonce)})),getAddress(p.predictedFactory))
 const previous=await client.getCode({address:p.predictedFactory,blockNumber:receipt.blockNumber-1n})
 assert(!previous||previous==='0x','Factory had code before this deployment.')
 const snapshots=[]
 for(const blockNumber of [receipt.blockNumber,head-5n,head]){
  const block=await client.getBlock({blockNumber});assert(block.hash)
  if(blockNumber===receipt.blockNumber)assert.equal(block.hash,receipt.blockHash)
  snapshots.push({blockNumber,hash:block.hash})
  await verifyArcTradeFactory(client,p.releaseCandidate,blockNumber)
  await verifyArcTradeAuthority(client,p.releaseCandidate,blockNumber)
 }
 for(const snapshot of snapshots)assert.equal((await client.getBlock({blockNumber:snapshot.blockNumber})).hash,snapshot.hash)
 const finalReceipt=await client.getTransactionReceipt({hash})
 assert.equal(finalReceipt.blockHash,receipt.blockHash);assert.equal(finalReceipt.status,'success')
 assert.equal(await client.getChainId(),5042)
 const report={verified:true,checkedAt:new Date().toISOString(),chainId:5042,transactionHash:hash,calldataHash:p.calldataHash,blockNumber:receipt.blockNumber.toString(),blockHash:receipt.blockHash,headBlock:head.toString(),confirmations:(head-receipt.blockNumber+1n).toString(),factory:p.predictedFactory,token:p.token,tokenDecimals:6,arbiter:p.predictedSafe,expectedRuntimeHash:p.expectedRuntimeHash,releaseCandidate:p.releaseCandidate,sourceSha256:p.sourceSha256,compiler:p.compiler,deploymentVerified:true,explorerSourceVerified:false,circleExecutionVerified:false,productionReady:false,fundingEnabled:false}
 await writeFile(outputFile,JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify({verified:true,factory:report.factory,arbiter:report.arbiter,confirmations:report.confirmations,runtimeMatches:true,officialUsdc:true,threshold:2,modules:[],fundingEnabled:false},null,2))
}
main().catch(error=>{console.error(error instanceof assert.AssertionError?error.message:'Arc Trade factory verification failed; no release configuration changed.');process.exitCode=1})
