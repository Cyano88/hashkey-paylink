import {keccak256,parseAbi,type PublicClient} from 'viem'
import {validateMultiGiftDeployment} from './multi-deployment.js'
import type {GiftDeployment} from './types.js'
import catalogue from '../../../src/pocket/lib/pocketXStocksCatalog.json'
const abi=parseAbi(['function treasury() view returns(address)','function claimAuthority() view returns(address)','function supportedToken(address) view returns(bool)','function PLATFORM_FEE_BPS() view returns(uint256)','function MAX_CLAIMS() view returns(uint32)','function decimals() view returns(uint8)'])
/** Read-only activation check. Does not provision keys or enable the deployment. */
export async function verifyMultiGiftDeployment(client:PublicClient,value:GiftDeployment){
 const d=validateMultiGiftDeployment(value)
 if(d.network==='xlayer'){
  const token=catalogue.assets.find(a=>a.address.toLowerCase()===d.token.toLowerCase())
  if(!token||token.symbol!==d.asset?.symbol)throw Error('Stock identity is not in the reviewed catalogue.')
 }
 if(await client.getChainId()!==d.chainId)throw Error('Wrong gift deployment network.')
 const height=await client.getBlockNumber({cacheTime:0})-BigInt(d.confirmations-1)
 if(height<BigInt(d.deploymentBlock!))throw Error('Gift deployment needs confirmations.')
 const block=await client.getBlock({blockNumber:height})
 const [code,tokenCode,authorityCode,treasury,authority,supported,fee,limit,decimals]=await Promise.all([
  client.getCode({address:d.escrow,blockNumber:height}),client.getCode({address:d.token,blockNumber:height}),client.getCode({address:d.claimAuthority!,blockNumber:height}),
  client.readContract({address:d.escrow,abi,functionName:'treasury',blockNumber:height}),client.readContract({address:d.escrow,abi,functionName:'claimAuthority',blockNumber:height}),client.readContract({address:d.escrow,abi,functionName:'supportedToken',args:[d.token],blockNumber:height}),client.readContract({address:d.escrow,abi,functionName:'PLATFORM_FEE_BPS',blockNumber:height}),client.readContract({address:d.escrow,abi,functionName:'MAX_CLAIMS',blockNumber:height}),client.readContract({address:d.token,abi,functionName:'decimals',blockNumber:height}),
 ])
 if(!code||code==='0x'||keccak256(code)!==d.runtimeHash||!tokenCode||tokenCode==='0x'||authorityCode&&authorityCode!=='0x'||treasury.toLowerCase()!==d.treasury.toLowerCase()||authority.toLowerCase()!==d.claimAuthority!.toLowerCase()||!supported||fee!==25n||limit!==1000||decimals!==(d.asset?.decimals??6))throw Error('Gift runtime, configuration or token precision does not match the reviewed manifest.')
 if(!block.hash||(await client.getBlock({blockNumber:height})).hash!==block.hash)throw Error('Gift confirmation changed.')
 return {verified:true,network:d.network,chainId:d.chainId,escrow:d.escrow,token:d.token,treasury:d.treasury,authority:d.claimAuthority,decimals,feeBps:25,maxRecipients:1000,blockNumber:String(height),blockHash:block.hash}
}
