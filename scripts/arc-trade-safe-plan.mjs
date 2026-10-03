import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createPublicClient,http,encodeAbiParameters,encodeFunctionData,getAddress,keccak256,parseAbi,stringToHex,zeroAddress} from 'viem'
import {TRADE_XLAYER_ARBITER} from '../src/lib/xstocksAgreement/protocol.ts'

// Read-only: no private keys, wallet connection or broadcast capability.
const revision='7b1fb6d615ab2d2999550ec9166554b180e813e5'
const root=`https://raw.githubusercontent.com/safe-global/safe-deployments/${revision}/src/assets/v1.5.0/`
const abi=parseAbi(['function getOwners() view returns(address[])','function getThreshold() view returns(uint256)','function VERSION() view returns(string)'])
async function main(){
 const [ownersFile,outputFile,...extra]=process.argv.slice(2)
 assert(ownersFile&&outputFile&&!extra.length,'Supply an intended-owner JSON file and output JSON path.')
 const intended=JSON.parse(await readFile(ownersFile,'utf8'))
 assert.equal(intended.sourceSafe?.toLowerCase(),TRADE_XLAYER_ARBITER.toLowerCase())
 assert.equal(intended.targetChainId,5042);assert.equal(intended.threshold,2)
 const owners=intended.owners.map(address=>getAddress(address))
 assert.equal(owners.length,2);assert.notEqual(owners[0],owners[1]);assert(!owners.includes(zeroAddress))
 const x=createPublicClient({transport:http('https://rpc.xlayer.tech',{timeout:15000,retryCount:1})})
 const arc=createPublicClient({transport:http('https://rpc.mainnet.arc.io',{timeout:15000,retryCount:1})})
 assert.equal(await x.getChainId(),196);assert.equal(await arc.getChainId(),5042)
 const xHead=await x.getBlockNumber(),arcHead=await arc.getBlockNumber()
 const xBlock=await x.getBlock({blockNumber:xHead-5n}),arcBlock=await arc.getBlock({blockNumber:arcHead-5n})
 for(const blockNumber of [xHead-5n,xHead]){
  const read=functionName=>x.readContract({address:TRADE_XLAYER_ARBITER,abi,functionName,blockNumber})
  assert.deepEqual((await read('getOwners')).map(a=>getAddress(a)).sort(),[...owners].sort())
  assert.equal(await read('getThreshold'),2n);assert.equal(await read('VERSION'),'1.5.0')
 }
 async function asset(name){
  const response=await fetch(root+name,{signal:AbortSignal.timeout(15000)})
  assert(response.ok,'Official registry unavailable')
  const data=await response.json();assert.equal(data.version,'1.5.0');assert.equal(data.released,true)
  const deployment=data.deployments[data.networkAddresses['5042']]
  assert(deployment,'Asset not registered on Arc')
  for(const blockNumber of [arcHead-5n,arcHead]){
   const code=await arc.getCode({address:deployment.address,blockNumber})
   assert(code&&code!=='0x');assert.equal(keccak256(code),deployment.codeHash,'Safe dependency bytecode mismatch')
  }
  return {...deployment,abi:data.abi}
 }
 const [singleton,factory]=await Promise.all([asset('safe.json'),asset('safe_proxy_factory.json')])
 assert.equal(await arc.readContract({address:singleton.address,abi,functionName:'VERSION',blockNumber:arcHead}),'1.5.0')
 for(const address of owners)for(const client of [x,arc]){
  const code=await client.getCode({address,blockNumber:client===x?xHead:arcHead})
  assert(!code||code==='0x','Contract signer requires separate cross-chain review')
 }
 const initializer=encodeFunctionData({abi:singleton.abi,functionName:'setup',args:[owners,2n,zeroAddress,'0x',zeroAddress,zeroAddress,0n,zeroAddress]})
 const saltNonce=BigInt(keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint256'},{type:'address[]'}],[keccak256(stringToHex('hashpaylink:arc-trade:safe:v1')),5042n,owners])))
 const args=[singleton.address,initializer,saltNonce]
 const data=encodeFunctionData({abi:factory.abi,functionName:'createProxyWithNonce',args})
 const simulation=await arc.simulateContract({address:factory.address,abi:factory.abi,functionName:'createProxyWithNonce',args,account:owners[0],blockNumber:arcHead})
 const predictedSafe=getAddress(simulation.result)
 const existing=await arc.getCode({address:predictedSafe,blockNumber:arcHead})
 assert(!existing||existing==='0x','Predicted Safe already exists; verify it instead of deploying again')
 const gas=await arc.estimateGas({account:owners[0],to:factory.address,data,value:0n})
 const gasPrice=await arc.getGasPrice(),gasWithMargin=gas*120n/100n
 const gasPayers=await Promise.all(owners.map(async address=>({address,hasEstimatedGasBalance:(await arc.getBalance({address}))>=gasWithMargin*gasPrice})))
 assert.equal((await x.getBlock({blockNumber:xHead-5n})).hash,xBlock.hash)
 assert.equal((await arc.getBlock({blockNumber:arcHead-5n})).hash,arcBlock.hash)
 assert.equal(await arc.getChainId(),5042)
 const report={status:'simulated-unsigned-safe-creation',checkedAt:new Date().toISOString(),registryRevision:revision,registryRoot:root,
  sourceSafe:TRADE_XLAYER_ARBITER,sourceChainId:196,sourceConfirmedBlock:xBlock.number.toString(),sourceBlockHash:xBlock.hash,
  chainId:5042,confirmedBlock:arcBlock.number.toString(),confirmedBlockHash:arcBlock.hash,simulatedAtBlock:arcHead.toString(),owners,threshold:2,version:'1.5.0',
  singleton:{address:singleton.address,runtimeHash:singleton.codeHash},proxyFactory:{address:factory.address,runtimeHash:factory.codeHash},
  initializer,initializerHash:keccak256(initializer),saltNonce:saltNonce.toString(),predictedSafe,
  transaction:{chainId:5042,to:factory.address,value:'0',data},calldataHash:keccak256(data),gasEstimate:gas.toString(),gasWithMargin:gasWithMargin.toString(),gasPriceWei:gasPrice.toString(),gasPayers,
  deployed:false,productionReady:false,fundingEnabled:false,
  next:'Refresh account, dependency hashes, gas and simulation before wallet submission. Verify receipt, proxy, singleton, exact owners, threshold two, empty modules and nonce before binding the Trade factory.'}
 await writeFile(outputFile,JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify({status:report.status,chainId:5042,owners:owners.length,threshold:2,version:report.version,predictedSafe,gasEstimate:report.gasEstimate,gasPayers,outputFile,deployed:false}))
}
main().catch(error=>{console.error(error instanceof assert.AssertionError?error.message:'Safe plan failed. No transaction was submitted and no production authority was configured.');process.exitCode=1})
