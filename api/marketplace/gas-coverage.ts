import {entryPoint06Address,entryPoint07Address,entryPoint08Address} from 'viem/account-abstraction'
import {getAddress,parseAbi,parseEventLogs,type PublicClient} from 'viem'
import {readDurableJson} from '../render-durable-store.js'
import type {readMarketplaceRuntimeConfig} from './runtime.js'
export type MarketplaceGasCoverage={id:string;holdingId:string;holdingRevision:string;walletId:string;holdingAddress:string;paymaster:string;projectIds:string[];maximumFeeUnits:string;providerPolicyConfirmed:true;approvedBy:string;verifiedAt:number;expiresAt:number;proofTransactionHash:`0x${string}`}
const abi=parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)'])
/** Operator-owned evidence, not developer input or a default gas-sponsorship assertion. */
export async function requireMarketplaceGasCoverage(settings:ReturnType<typeof readMarketplaceRuntimeConfig>,projectId:string,feeUnits:string,chain:Pick<PublicClient,'getTransactionReceipt'|'getBlock'|'getChainId'>,read=()=>readDurableJson<MarketplaceGasCoverage>('hashpaylink:marketplace-gas-coverage:v1'),now=Date.now()){
 const p=await read()
 if(!p||p.providerPolicyConfirmed!==true||!p.approvedBy||!p.id||p.holdingId!==settings.holdingId||p.holdingRevision!==settings.holdingRevision||p.walletId!==settings.config.walletId||getAddress(p.holdingAddress)!==getAddress(settings.config.treasuryAddress)||!p.projectIds.includes(projectId)||!Number.isSafeInteger(p.verifiedAt)||!Number.isSafeInteger(p.expiresAt)||p.verifiedAt>now||p.expiresAt<=now+5000||p.expiresAt-p.verifiedAt>86400000||!/^0x[0-9a-f]{64}$/i.test(p.proofTransactionHash)||!/^\d{1,24}$/.test(feeUnits)||!/^\d{1,24}$/.test(p.maximumFeeUnits)||BigInt(feeUnits)>BigInt(p.maximumFeeUnits)||/^0x0{40}$/i.test(p.paymaster))throw Error('Current marketplace gas coverage is not verified.')
 if(await chain.getChainId()!==8453)throw Error('Gas coverage requires Base.')
 const [receipt,finalized]=await Promise.all([chain.getTransactionReceipt({hash:p.proofTransactionHash}),chain.getBlock({blockTag:'finalized'})])
 const canonical=await chain.getBlock({blockNumber:receipt.blockNumber})
 if(receipt.status!=='success'||finalized.number===null||receipt.blockNumber>finalized.number||canonical.hash!==receipt.blockHash)throw Error('Gas coverage proof is not finalized.')
 const events=parseEventLogs({abi,logs:receipt.logs,eventName:'UserOperationEvent'})
 if(!events.some(e=>[entryPoint06Address,entryPoint07Address,entryPoint08Address].some(a=>a.toLowerCase()===e.address.toLowerCase())&&e.args.success&&getAddress(e.args.sender)===getAddress(p.holdingAddress)&&getAddress(e.args.paymaster)===getAddress(p.paymaster)))throw Error('Gas coverage proof does not match the holding wallet.')
 return p
}
