import {encodeFunctionData,getAddress,isAddress,parseAbi,zeroHash,type Hex} from 'viem'
import {PublicKey} from '@solana/web3.js'
import {getAssociatedTokenAddress} from '../solana-token.js'
import {CCTP_DOMAIN,CCTP_FORWARD_HOOK,cctpForwardHookForSolana,SOLANA_USDC_MINT,type PocketBridgeNetwork} from './cctp.js'
import {crossBridgeAsset} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'
import {evmBridgeRevenue,validateEvmBridgeRevenue,type EvmBridgeRevenue} from './bridge-revenue-config.js'
import {evmGasRecipient,type FeeRouting} from '../../src/lib/platformFees.js'

/** Circle Bridge Kit 1.17.0 mainnet registry; adapter-viem-v2 1.20.0 ABI.
 * Prepared calldata only. Existing Circle user-controlled signing stays outside.
 * Solana requires the separately audited Bridge Kit program/rent path. */
export const CIRCLE_KIT_BRIDGE='0xB3FA262d0fB521cc93bE83d87b322b8A23DAf3F0' as const
export const CIRCLE_KIT_EVM_SOURCES=['ethereum','base','arbitrum','polygon','arc'] as const
export const circleKitBridgeAbi=parseAbi(['function bridgeWithPreapprovalAndHook((uint256 amount,uint256 maxFee,uint256 fee,bytes32 mintRecipient,bytes32 destinationCaller,address burnToken,address feeRecipient,uint32 destinationDomain,uint32 minFinalityThreshold) bridgeParams,bytes hookData)','function calculateFeeShares(uint256 fee) view returns(uint256 developerShare,uint256 protocolShare)'])
const tokenAbi=parseAbi(['function approve(address spender,uint256 amount) returns(bool)','function transfer(address to,uint256 amount) returns(bool)'])
const batchAbi=parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
export type CircleKitFeeInput=FeeRouting & {source:typeof CIRCLE_KIT_EVM_SOURCES[number];destination:PocketBridgeNetwork;walletAddress:Hex;destinationAddress:string;transferUnits:bigint;providerFeeUnits:bigint;reimbursementUnits:bigint;finalityThreshold:1000|2000;includeRecipientSetup?:boolean}
/** Fee collection is inside Circle's bridge call. Never add a direct revenue transfer. */
export async function buildCircleKitFeeBatch(i:CircleKitFeeInput,env:NodeJS.ProcessEnv=process.env,revenueSnapshot?:EvmBridgeRevenue){
 if(!(CIRCLE_KIT_EVM_SOURCES as readonly string[]).includes(i.source)||!Object.hasOwn(CCTP_DOMAIN,i.destination)||i.source===i.destination||!isAddress(i.walletAddress)||/^0x0{40}$/i.test(i.walletAddress)||i.transferUnits<=0n||i.providerFeeUnits<0n||i.reimbursementUnits<=0n||![1000,2000].includes(i.finalityThreshold))throw Error('Invalid Circle bridge fee binding.')
 const revenue=revenueSnapshot??evmBridgeRevenue(i.transferUnits,env);validateEvmBridgeRevenue(revenue,i.transferUnits,i.walletAddress)
 if(BigInt(revenue.amountUnits)<=0n)throw Object.assign(Error('Amount too small for the configured bridge fee.'),{status:422,code:'amount_too_low'})
 const token=crossBridgeAsset(i.source,'USDC'),burnUnits=i.transferUnits+i.providerFeeUnits,approvalUnits=burnUnits+BigInt(revenue.amountUnits),totalUnits=approvalUnits+i.reimbursementUnits
 if(totalUnits>=2n**128n)throw Error('Circle bridge amount is too large.')
 let mintRecipient:Hex,hookData:Hex
 if(i.destination==='solana'){
  const wallet=new PublicKey(i.destinationAddress);if(wallet.equals(PublicKey.default))throw Error('Invalid Circle bridge recipient.')
  const ata=await getAssociatedTokenAddress(SOLANA_USDC_MINT,wallet,true)
  mintRecipient=('0x'+ata.toBuffer().toString('hex')) as Hex;hookData=cctpForwardHookForSolana(wallet,i.includeRecipientSetup===true) as Hex
 }else{
  if(!isAddress(i.destinationAddress)||/^0x0{40}$/i.test(i.destinationAddress)||i.includeRecipientSetup)throw Error('Invalid Circle bridge recipient.')
  mintRecipient=('0x'+i.destinationAddress.slice(2).toLowerCase().padStart(64,'0')) as Hex;hookData=CCTP_FORWARD_HOOK
 }
 const bridgeParams={amount:burnUnits,maxFee:i.providerFeeUnits,fee:BigInt(revenue.amountUnits),mintRecipient,destinationCaller:zeroHash,burnToken:getAddress(token.address),feeRecipient:revenue.recipient,destinationDomain:CCTP_DOMAIN[i.destination],minFinalityThreshold:i.finalityThreshold}
 const bridgeData=encodeFunctionData({abi:circleKitBridgeAbi,functionName:'bridgeWithPreapprovalAndHook',args:[bridgeParams,hookData]})
 const approve=(amount:bigint)=>({target:getAddress(token.address),value:0n,data:encodeFunctionData({abi:tokenAbi,functionName:'approve',args:[CIRCLE_KIT_BRIDGE,amount]})})
 const calls=[approve(0n),approve(approvalUnits),{target:CIRCLE_KIT_BRIDGE,value:0n,data:bridgeData},approve(0n),{target:getAddress(token.address),value:0n,data:encodeFunctionData({abi:tokenAbi,functionName:'transfer',args:[evmGasRecipient(i),i.reimbursementUnits]})}]
 return {feeRoutingVersion:i.feeRoutingVersion,collector:'circle_bridge_kit' as const,source:i.source,destination:i.destination,asset:'USDC' as const,platformFee:{recipient:revenue.recipient,bps:revenue.bps,grossAmountUnits:revenue.amountUnits,sharePolicy:'contract_calculateFeeShares' as const,state:'prepared' as const},burnUnits,approvalUnits,totalUnits,feeUnits:i.providerFeeUnits+BigInt(revenue.amountUnits)+i.reimbursementUnits,bridgeParams,hookData,calls,callData:encodeFunctionData({abi:batchAbi,functionName:'executeBatch',args:[calls]})}
}
