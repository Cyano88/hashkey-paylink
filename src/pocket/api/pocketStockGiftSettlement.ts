import {encodeFunctionData,recoverTypedDataAddress,parseAbi,keccak256,type Address,type Hex,type PublicClient} from 'viem'
import {MULTI_GIFT_ABI,multiGiftPlan,multiGiftClaimTypedData} from '../features/gifts/pocketMultiGift'
import {giftContractId} from '../features/gifts/pocketGiftSigning'
import {STOCK_GIFT_DEPLOYMENTS,type StockGiftDeployment} from '../lib/pocketGiftDeployments'
import {preflightStockGiftCall,readStockGiftAsset,sameStockGiftAsset} from './pocketStockGiftAsset'
import type {StockGiftFundingReview} from './pocketStockGiftExecution'
import type {StockGiftIntent} from './pocketStockGiftIntent'
const configAbi=parseAbi(['function treasury() view returns(address)','function claimAuthority() view returns(address)','function supportedToken(address) view returns(bool)','function PLATFORM_FEE_BPS() view returns(uint256)'])

export function stockGiftFundingReview(intent:StockGiftIntent,owner:Address,pins:readonly StockGiftDeployment[]=STOCK_GIFT_DEPLOYMENTS):StockGiftFundingReview{
 const pin=pins.find(p=>p.escrow.toLowerCase()===intent.escrow.toLowerCase()&&sameStockGiftAsset(p.asset,intent.asset))
 if(!pin||intent.asset.chainId!==196||intent.asset.rail!=='xstocks'||intent.owner.toLowerCase()!==owner.toLowerCase()||giftContractId(intent.sender,intent.salt).toLowerCase()!==intent.giftId.toLowerCase()||!/^\d{1,20}$/.test(intent.expiresAt))throw Error('Stock gift does not match a reviewed deployment or your wallet.')
 if(intent.kind==='funding'&&intent.sender.toLowerCase()!==owner.toLowerCase())throw Error('Open the wallet that created this gift.')
 return {owner,escrow:pin.escrow,runtimeHash:pin.runtimeHash,treasury:pin.treasury,authority:pin.authority,asset:pin.asset,signer:intent.signer,salt:intent.salt,amountPerRecipient:intent.amountPerRecipient,recipients:intent.recipients,expiresAt:BigInt(intent.expiresAt)}
}

/** Derive calls locally; never sign arbitrary server calldata. */
export async function prepareStockGiftSettlement(intent:StockGiftIntent,owner:Address,client:PublicClient,pins:readonly StockGiftDeployment[]=STOCK_GIFT_DEPLOYMENTS){
 const review=stockGiftFundingReview(intent,owner,pins)
 if(intent.kind!=='claim'&&intent.kind!=='refund')throw Error('Invalid gift settlement.')
 const asset=await readStockGiftAsset(review.asset.token,client)
 if(!sameStockGiftAsset(asset,review.asset))throw Error('Stock details changed.')
 const [code,treasury,authority,supported,fee,gift,block]=await Promise.all([client.getCode({address:review.escrow}),client.readContract({address:review.escrow,abi:configAbi,functionName:'treasury'}),client.readContract({address:review.escrow,abi:configAbi,functionName:'claimAuthority'}),client.readContract({address:review.escrow,abi:configAbi,functionName:'supportedToken',args:[asset.token]}),client.readContract({address:review.escrow,abi:configAbi,functionName:'PLATFORM_FEE_BPS'}),client.readContract({address:review.escrow,abi:MULTI_GIFT_ABI,functionName:'gifts',args:[intent.giftId]}),client.getBlock()])
 if(!code||keccak256(code)!==review.runtimeHash||treasury.toLowerCase()!==review.treasury.toLowerCase()||authority.toLowerCase()!==review.authority.toLowerCase()||!supported||fee!==25n)throw Error('Stock gift contract could not be verified.')
 const plan=multiGiftPlan(intent.amountPerRecipient,intent.recipients,asset)
 if(gift[0].toLowerCase()!==intent.sender.toLowerCase()||gift[1].toLowerCase()!==asset.token.toLowerCase()||gift[2].toLowerCase()!==intent.signer.toLowerCase()||gift[3]!==plan.amountPerClaim||gift[4]!==intent.recipients||gift[6]!==review.expiresAt||gift[7]!==1||gift[5]>=gift[4])throw Error('Gift details or availability changed. Refresh this gift.')
 let data:Hex
 if(intent.kind==='refund'){
  if(owner.toLowerCase()!==intent.sender.toLowerCase()||block.timestamp<review.expiresAt)throw Error('Only expired gifts can be refunded by their sender.')
  data=encodeFunctionData({abi:MULTI_GIFT_ABI,functionName:'refundExpired',args:[intent.giftId]})
 }else{
  const claim=intent.claim
  if(!claim||claim.recipient.toLowerCase()!==owner.toLowerCase()||!/^\d{1,20}$/.test(claim.deadline)||block.timestamp>BigInt(claim.deadline)||block.timestamp>=review.expiresAt)throw Error('Claim approval expired or belongs to another wallet.')
  const typed=multiGiftClaimTypedData({chainId:196,escrow:review.escrow,giftId:intent.giftId,accountId:claim.accountId,recipient:owner,deadline:BigInt(claim.deadline)})
  const [signer,authorizer,accountClaimed,walletClaimed]=await Promise.all([recoverTypedDataAddress({...typed,signature:claim.signature}),recoverTypedDataAddress({...typed,signature:claim.accountSignature}),client.readContract({address:review.escrow,abi:MULTI_GIFT_ABI,functionName:'claimedAccount',args:[intent.giftId,claim.accountId]}),client.readContract({address:review.escrow,abi:MULTI_GIFT_ABI,functionName:'claimedWallet',args:[intent.giftId,owner]})])
  if(signer.toLowerCase()!==intent.signer.toLowerCase()||authorizer.toLowerCase()!==review.authority.toLowerCase()||accountClaimed||walletClaimed)throw Error('Gift claim authorization could not be verified or was already used.')
  data=encodeFunctionData({abi:MULTI_GIFT_ABI,functionName:'claim',args:[intent.giftId,claim.accountId,owner,BigInt(claim.deadline),claim.signature,claim.accountSignature]})
 }
 const call={to:review.escrow,data,value:0n as const}
 await preflightStockGiftCall(owner,call,client)
 return call
}
