import {getAddress,isAddress,keccak256,parseAbi,type PublicClient} from 'viem'
import {GiftError,type GiftDeployment} from './types.js'
const BASE_USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
export function validateBaseGiftDeployment(value:GiftDeployment){
 if(value.network!=='base'||value.chainId!==8453||!isAddress(value.escrow)||!isAddress(value.treasury)||getAddress(value.token)!==getAddress(BASE_USDC)||!/^0x[0-9a-fA-F]{64}$/.test(value.runtimeHash)||!/^\d+$/.test(value.deploymentBlock||'')||!Number.isSafeInteger(value.confirmations)||value.confirmations<2||/^0x0{40}$/i.test(value.treasury)||value.treasury.toLowerCase()===value.escrow.toLowerCase())throw new GiftError(503,'Base gift deployment is not verified.')
 return value
}
export async function verifyBaseGiftDeployment(client:PublicClient,value:GiftDeployment){
 const d=validateBaseGiftDeployment(value)
 if(await client.getChainId()!==8453)throw Error('Wrong deployment network')
 const head=await client.getBlockNumber({cacheTime:0})
 if(BigInt(d.deploymentBlock!)>head-BigInt(d.confirmations-1))throw Error('Deployment needs confirmations')
 const abi=parseAbi(['function usdc() view returns(address)','function treasury() view returns(address)','function PLATFORM_FEE_BPS() view returns(uint256)','function decimals() view returns(uint8)'])
 const [code,token,treasury,fee,decimals]=await Promise.all([client.getCode({address:d.escrow}),client.readContract({address:d.escrow,abi,functionName:'usdc'}),client.readContract({address:d.escrow,abi,functionName:'treasury'}),client.readContract({address:d.escrow,abi,functionName:'PLATFORM_FEE_BPS'}),client.readContract({address:d.token,abi,functionName:'decimals'})])
 if(!code||keccak256(code)!==d.runtimeHash||getAddress(token)!==getAddress(d.token)||getAddress(treasury)!==getAddress(d.treasury)||fee!==25n||decimals!==6)throw Error('Deployed gift contract does not match the reviewed manifest')
 return {network:'base',chainId:8453,escrow:d.escrow,treasury:d.treasury,feeBps:25,verified:true as const}
}
