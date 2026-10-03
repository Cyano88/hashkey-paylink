import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createPublicClient,http,decodeEventLog,getAddress,keccak256,parseAbi,toHex} from 'viem'

async function main(){
 const [planFile,hash,outputFile,...extra]=process.argv.slice(2)
 assert(planFile&&/^0x[0-9a-f]{64}$/i.test(hash)&&outputFile&&!extra.length,'Supply plan, transaction hash and output path.')
 const p=JSON.parse(await readFile(planFile,'utf8'))
 assert.equal(p.chainId,5042);assert.equal(p.threshold,2)
 const client=createPublicClient({transport:http('https://rpc.mainnet.arc.io',{timeout:15000,retryCount:1})})
 assert.equal(await client.getChainId(),5042)
 const [tx,receipt,head]=await Promise.all([client.getTransaction({hash}),client.getTransactionReceipt({hash}),client.getBlockNumber()])
 assert.equal(receipt.status,'success');assert(head>=receipt.blockNumber+5n,'Wait for five subsequent blocks.')
 assert.equal(tx.hash.toLowerCase(),hash.toLowerCase());assert.equal(tx.blockHash,receipt.blockHash)
 assert.equal(tx.chainId,5042);assert.equal(tx.value,0n)
 assert.equal(getAddress(tx.from),'0xaA6EE4589832Fb9FA49c27cB56CBcecf29B847c7')
 assert.equal(getAddress(tx.to),getAddress(p.proxyFactory.address));assert.equal(tx.input.toLowerCase(),p.transaction.data.toLowerCase())
 assert.equal(keccak256(tx.input),p.calldataHash)
 const abi=parseAbi(['function getOwners() view returns(address[])','function getThreshold() view returns(uint256)','function VERSION() view returns(string)','function nonce() view returns(uint256)','function getModulesPaginated(address,uint256) view returns(address[],address)'])
 const sentinel='0x0000000000000000000000000000000000000001'
 const eventAbi=parseAbi(['event ProxyCreation(address indexed proxy,address singleton)'])
 const events=[]
 for(const log of receipt.logs)if(getAddress(log.address)===getAddress(p.proxyFactory.address)){
  try{events.push(decodeEventLog({abi:eventAbi,data:log.data,topics:log.topics}))}catch{}
 }
 assert.equal(events.length,1);assert.equal(getAddress(events[0].args.proxy),getAddress(p.predictedSafe));assert.equal(getAddress(events[0].args.singleton),getAddress(p.singleton.address))
 const previous=await client.getCode({address:p.predictedSafe,blockNumber:receipt.blockNumber-1n})
 assert(!previous||previous==='0x','Proxy already had code before this transaction.')
 let proxyRuntimeHash
 const snapshots=[]
 for(const blockNumber of [receipt.blockNumber,head-5n,head]){
  const block=await client.getBlock({blockNumber});assert(block.hash)
  if(blockNumber===receipt.blockNumber)assert.equal(block.hash,receipt.blockHash)
  snapshots.push({number:blockNumber,hash:block.hash})
  for(const dep of [p.proxyFactory,p.singleton]){
   const code=await client.getCode({address:dep.address,blockNumber});assert(code&&code!=='0x');assert.equal(keccak256(code),dep.runtimeHash)
  }
  const code=await client.getCode({address:p.predictedSafe,blockNumber});assert(code&&code!=='0x')
  const currentHash=keccak256(code);if(proxyRuntimeHash)assert.equal(currentHash,proxyRuntimeHash);proxyRuntimeHash=currentHash
  const slot=await client.getStorageAt({address:p.predictedSafe,slot:toHex(0n,{size:32}),blockNumber})
  assert.equal(getAddress('0x'+slot.slice(-40)),getAddress(p.singleton.address))
  const read=(functionName,args)=>client.readContract({address:p.predictedSafe,abi,functionName,args,blockNumber})
  const [owners,threshold,version,nonce,modules]=await Promise.all([read('getOwners'),read('getThreshold'),read('VERSION'),read('nonce'),read('getModulesPaginated',[sentinel,10n])])
  assert.deepEqual(owners.map(a=>getAddress(a)).sort(),p.owners.map(a=>getAddress(a)).sort())
  assert.equal(owners.length,2);assert.equal(threshold,2n);assert.equal(version,'1.5.0');assert.equal(nonce,0n)
  assert.equal(modules[0].length,0);assert.equal(getAddress(modules[1]),getAddress(sentinel))
 }
 for(const snapshot of snapshots)assert.equal((await client.getBlock({blockNumber:snapshot.number})).hash,snapshot.hash)
 assert.equal((await client.getTransactionReceipt({hash})).blockHash,receipt.blockHash)
 assert.equal(await client.getChainId(),5042)
 const report={verified:true,checkedAt:new Date().toISOString(),chainId:5042,transactionHash:hash,calldataHash:p.calldataHash,blockNumber:receipt.blockNumber.toString(),blockHash:receipt.blockHash,headBlock:head.toString(),confirmations:(head-receipt.blockNumber+1n).toString(),safe:getAddress(p.predictedSafe),owners:p.owners,threshold:2,version:'1.5.0',nonce:'0',modules:[],proxyRuntimeHash,singleton:p.singleton,proxyFactory:p.proxyFactory,sourceRegistryRevision:p.registryRevision,deploymentVerified:true,tradeFactoryDeployed:false,productionReady:false,fundingEnabled:false}
 await writeFile(outputFile,JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify(report,null,2))
}
main().catch(error=>{console.error(error instanceof assert.AssertionError?error.message:'Arc Safe receipt verification failed; no release configuration changed.');process.exitCode=1})
