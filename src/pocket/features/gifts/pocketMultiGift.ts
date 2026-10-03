import {encodeFunctionData,formatUnits,isAddress,parseAbi,type Address,type Hex} from 'viem'
import {giftContractId} from './pocketGiftSigning'
export type MultiGiftAsset={chainId:number;token:Address;symbol:string;decimals:number;rail:'stablecoins'|'xstocks'}
// Charged on top of principal in the gifted asset; recipient shares are never reduced.
export const MULTI_GIFT_FEE_BPS=25n
export function multiGiftPlan(amountPerRecipient:string,recipients:number,asset:MultiGiftAsset){
 if(!Number.isSafeInteger(recipients)||recipients<1||recipients>1000)throw Error('Choose between 1 and 1,000 recipients.')
 if(!Number.isSafeInteger(asset.chainId)||asset.chainId<1||!isAddress(asset.token)||/^0x0{40}$/i.test(asset.token)||!Number.isSafeInteger(asset.decimals)||asset.decimals<0||asset.decimals>36)throw Error('Invalid gift asset.')
 if(!/^(?:0|[1-9][0-9]{0,38})(?:\.[0-9]+)?$/.test(amountPerRecipient))throw Error('Enter a valid amount per recipient.')
 const [whole,fraction='']=amountPerRecipient.split('.');if(fraction.length>asset.decimals)throw Error('Amount exceeds token precision.')
 const units=BigInt(whole)*10n**BigInt(asset.decimals)+BigInt(fraction.padEnd(asset.decimals,'0')||'0')
 if(units<=0n||units>=(1n<<128n))throw Error('Gift amount is out of range.')
 const principal=units*BigInt(recipients),fee=principal*MULTI_GIFT_FEE_BPS/10000n
 return {amountPerClaim:units,maxClaims:recipients,principal,fee,totalDebit:principal+fee,total:formatUnits(principal,asset.decimals)}
}
export function multiGiftClaimTypedData(input:{chainId:number;escrow:Address;giftId:Hex;accountId:Hex;recipient:Address;deadline:bigint}){
 if(!Number.isSafeInteger(input.chainId)||input.chainId<1||![input.escrow,input.recipient].every(a=>isAddress(a)&&!/^0x0{40}$/i.test(a))||input.escrow.toLowerCase()===input.recipient.toLowerCase()||![input.giftId,input.accountId].every(x=>/^0x[0-9a-fA-F]{64}$/.test(x)&&!/^0x0{64}$/.test(x))||input.deadline<=0n||input.deadline>=(1n<<64n))throw Error('Invalid gift claim.')
 return {domain:{name:'PocketMultiGift',version:'1',chainId:input.chainId,verifyingContract:input.escrow},types:{Claim:[{name:'giftId',type:'bytes32'},{name:'accountId',type:'bytes32'},{name:'recipient',type:'address'},{name:'deadline',type:'uint64'}]},primaryType:'Claim',message:{giftId:input.giftId,accountId:input.accountId,recipient:input.recipient,deadline:input.deadline}} as const
}
export const MULTI_GIFT_ABI=parseAbi([
 'function createGift(bytes32 salt,address token,address signer,uint128 amountPerClaim,uint32 maxClaims,uint64 expiresAt) returns(bytes32)',
 'function claim(bytes32 id,bytes32 accountId,address recipient,uint64 deadline,bytes giftSignature,bytes accountSignature)',
 'function refundExpired(bytes32 id)',
 'function gifts(bytes32) view returns(address sender,address token,address claimSigner,uint128 amountPerClaim,uint32 maxClaims,uint32 claimed,uint64 expiresAt,uint8 status)',
 'function claimedAccount(bytes32,bytes32) view returns(bool)',
 'function claimedWallet(bytes32,address) view returns(bool)',
])
export function prepareMultiGiftFunding(input:{sender:Address;escrow:Address;asset:MultiGiftAsset;signer:Address;salt:Hex;amountPerRecipient:string;recipients:number;expiresAt:bigint;now:bigint}){
 if(![input.sender,input.escrow,input.signer].every(a=>isAddress(a)&&!/^0x0{40}$/i.test(a))||input.asset.token.toLowerCase()===input.escrow.toLowerCase()||!/^0x[0-9a-fA-F]{64}$/.test(input.salt)||/^0x0{64}$/.test(input.salt)||input.now<0n||input.expiresAt<=input.now||input.expiresAt>input.now+30n*86400n)throw Error('Invalid gift funding.')
 const plan=multiGiftPlan(input.amountPerRecipient,input.recipients,input.asset)
 return {...plan,giftId:giftContractId(input.sender,input.salt),approval:{to:input.asset.token,data:encodeFunctionData({abi:parseAbi(['function approve(address,uint256) returns(bool)']),functionName:'approve',args:[input.escrow,plan.totalDebit]})},funding:{to:input.escrow,data:encodeFunctionData({abi:MULTI_GIFT_ABI,functionName:'createGift',args:[input.salt,input.asset.token,input.signer,plan.amountPerClaim,plan.maxClaims,input.expiresAt]})}}
}

export function multiGiftReview(amountPerRecipient:string,recipients:number,asset:MultiGiftAsset){
 const plan=multiGiftPlan(amountPerRecipient,recipients,asset)
 const display=(units:bigint)=>formatUnits(units,asset.decimals)+' '+asset.symbol
 return {plan,rows:[['Recipients',String(recipients)],['Each recipient',display(plan.amountPerClaim)],['Gift total',display(plan.principal)],['Creation fee (0.25%)',display(plan.fee)],['Total stock debit',display(plan.totalDebit)]] as [string,string][],feeToken:asset.token,feeCopy:'The creation fee is paid in '+asset.symbol+' on top of the gift. Each recipient gets the full stated quantity. Network fees are separate.'}
}
