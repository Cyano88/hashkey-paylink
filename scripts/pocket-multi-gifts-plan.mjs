// Generates an unsigned deployment plan. Never loads a private key or broadcasts.
import {readFile,writeFile} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {createPublicClient,encodeDeployData,getAddress,getContractAddress,http,isAddress,keccak256,parseAbi} from 'viem'
import catalogue from '../src/pocket/lib/pocketXStocksCatalog.json' with {type:'json'}
async function main(){
 const [inputPath,outputPath]=process.argv.slice(2)
 if(!inputPath||!outputPath)throw Error('Use: node scripts/pocket-multi-gifts-plan.mjs <public-config.json> <unsigned-plan.json>')
 const input=JSON.parse(await readFile(inputPath,'utf8'))
 if(input.network!=='xlayer'&&input.network!=='base')throw Error('Unsupported network.')
 for(const key of ['deployer','treasury','authority'])if(!isAddress(input[key]||'')||/^0x0{40}$/i.test(input[key]))throw Error('A nonzero public '+key+' address is required.')
 if(input.authority.toLowerCase()===input.deployer.toLowerCase()||input.authority.toLowerCase()===input.treasury.toLowerCase())throw Error('Use a dedicated gift claim authority.')
 const chainId=input.network==='xlayer'?196:8453
 const tokens=input.tokens?.map(t=>getAddress(t))
 if(!Array.isArray(tokens)||!tokens.length||new Set(tokens.map(t=>t.toLowerCase())).size!==tokens.length)throw Error('Choose unique reviewed tokens.')
 if(tokens.some(t=>input.network==='xlayer'?!catalogue.assets.some(a=>a.address.toLowerCase()===t.toLowerCase()):t.toLowerCase()!=='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'))throw Error('Token is outside the Pocket catalogue.')
 const shareAccounting=input.accounting==='shares-v1'
 if(input.accounting!==undefined&&!shareAccounting||shareAccounting&&input.network!=='xlayer')throw Error('Unsupported accounting.')
 const contractName=shareAccounting?'PocketStockGiftEscrow':'PocketMultiGiftEscrow'
 const artifactPath=resolve('contracts/artifacts-gifts/contracts/gifts/'+contractName+'.sol/'+contractName+'.json')
 const artifact=JSON.parse(await readFile(artifactPath,'utf8')),debug=JSON.parse(await readFile(artifactPath.replace(/\.json$/,'.dbg.json'),'utf8'))
 const build=JSON.parse(await readFile(resolve(dirname(artifactPath),debug.buildInfo),'utf8'))
 for(const [name,source] of Object.entries(build.input.sources)){
  const path=resolve('contracts',name.startsWith('@')?'node_modules/'+name:name)
  if(await readFile(path,'utf8')!==source.content)throw Error('Stale compiled source: '+name)
 }
 const url=chainId===196?process.env.XLAYER_RPC_URL||'https://rpc.xlayer.tech':process.env.PRIVATE_RPC_URL
 if(!url)throw Error('Configure the matching RPC endpoint.')
 const client=createPublicClient({transport:http(url,{timeout:15000,retryCount:1})})
 if(await client.getChainId()!==chainId)throw Error('Wrong RPC chain.')
 const authorityCode=await client.getCode({address:input.authority})
 if(authorityCode&&authorityCode!=='0x')throw Error('Gift authority must use an ECDSA signing key.')
 const assets=[];const tokenAbi=parseAbi(['function decimals() view returns(uint8)'])
 let nextToken=0,checked=0
 await Promise.all(Array.from({length:8},async()=>{while(nextToken<tokens.length){const index=nextToken++,token=tokens[index]
  const [code,decimals]=await Promise.all([client.getCode({address:token}),client.readContract({address:token,abi:tokenAbi,functionName:'decimals'})])
  if(!code||code==='0x'||!Number.isInteger(decimals)||decimals<0||decimals>36||chainId===8453&&decimals!==6)throw Error('Invalid token code or precision: '+token)
  if(shareAccounting){
   const shareAbi=parseAbi(['function getCurrentMultiplier() view returns(uint256,uint256,uint256)','function getSharesByUnderlyingAmount(uint256) view returns(uint256)','function getUnderlyingAmountByShares(uint256) view returns(uint256)','function sharesOf(address) view returns(uint256)'])
   const amount=10n**BigInt(decimals),[multiplier]=await client.readContract({address:token,abi:shareAbi,functionName:'getCurrentMultiplier'})
   const shares=await client.readContract({address:token,abi:shareAbi,functionName:'getSharesByUnderlyingAmount',args:[amount]})
   const represented=await client.readContract({address:token,abi:shareAbi,functionName:'getUnderlyingAmountByShares',args:[shares]})
   await client.readContract({address:token,abi:shareAbi,functionName:'sharesOf',args:[input.deployer]})
   if(multiplier<=0n||shares<=0n||represented>amount)throw Error('Invalid token share API: '+token)
  }
  assets[index]={chainId,token,symbol:chainId===8453?'USDC':catalogue.assets.find(a=>a.address.toLowerCase()===token.toLowerCase()).symbol,decimals,rail:chainId===196?'xstocks':'stablecoins'}
  checked++;if(checked%100===0)console.log(JSON.stringify({tokensVerified:checked,total:tokens.length}))
 }}))
 const data=encodeDeployData({abi:artifact.abi,bytecode:artifact.bytecode,args:[tokens,getAddress(input.treasury),getAddress(input.authority)]})
 const nonce=await client.getTransactionCount({address:input.deployer,blockTag:'pending'})
 const predictedEscrow=getContractAddress({from:input.deployer,nonce:BigInt(nonce)})
 const [gas,gasPrice,balance,simulation]=await Promise.all([client.estimateGas({account:input.deployer,data,value:0n}),client.getGasPrice(),client.getBalance({address:input.deployer}),client.call({account:input.deployer,data,value:0n})])
 if(!simulation.data||simulation.data==='0x')throw Error('Constructor simulation returned no runtime.')
 const maxGas=(gas*120n+99n)/100n,maximumNetworkFee=maxGas*gasPrice
 const plan={...(shareAccounting?{accounting:'shares-v1'}:{}),status:'unsigned_requires_review',network:input.network,chainId,deployer:getAddress(input.deployer),treasury:getAddress(input.treasury),authority:getAddress(input.authority),assets,predictedEscrow,nonce,compiler:build.solcLongVersion,compilerSettings:build.input.settings,creationCodeHash:keccak256(artifact.bytecode),deploymentDataHash:keccak256(data),simulatedRuntime:simulation.data,simulatedRuntimeHash:keccak256(simulation.data),transaction:{chainId,nonce,data,value:'0',gas:String(maxGas),gasPrice:String(gasPrice)},maximumNetworkFee:String(maximumNetworkFee),deployerHasFeeBalance:balance>=maximumNetworkFee,generatedAt:new Date().toISOString(),remainingChecks:['Recheck nonce, gas and constructor simulation immediately before signing.','Provision dedicated authority and stable identity secret in the server secret store.','Verify the deployed receipt, runtime and each token before pinning the manifest.','Verify token transfer restrictions and native funding, claim, refund and interruption recovery before activation.']}
 await writeFile(outputPath,JSON.stringify(plan,null,2)+'\n',{flag:'wx'})
 console.log(JSON.stringify({written:outputPath,network:plan.network,predictedEscrow,tokens:assets.length,deployerHasFeeBalance:plan.deployerHasFeeBalance,signed:false,broadcast:false}))
}
main().catch(error=>{console.error(error instanceof Error&&/required|Use:|Unsupported|Choose|dedicated|catalogue|Stale compiled|Configure|Invalid token|Wrong RPC|Gift authority|Constructor/.test(error.message)?error.message:'Deployment planning failed. Check public configuration and RPC state; no transaction was sent.');process.exitCode=1})
