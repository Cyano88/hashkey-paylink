import type {Address,Hex} from 'viem'
import {isAddress} from 'viem'
import {CHAIN_META} from '../../lib/chains'
import type {CircleEvmEmailSession} from '../../lib/circleEvmEmailWallet'
import {pocketApiUrl} from '../lib/pocketRoutes'
import {parseGiftLink} from '../features/gifts/pocketGift'
import {signGiftClaim} from '../features/gifts/pocketGiftSigning'
export type GiftApproval={id:string;phase:'authorizing'|'awaiting_approval'|'authorization_unknown';challengeId?:string;transactionId?:string}
type Options={accessToken:string;fetcher?:typeof fetch}
async function postGift(body:Record<string,string>,options:Options){
 const response=await(options.fetcher??fetch)(pocketApiUrl('/api/pocket/gifts'),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+options.accessToken},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(15000)})
 const data=await response.json().catch(()=>undefined)
 if(!response.ok||!data?.ok)throw Error(typeof data?.error?.message==='string'?data.error.message:'Gift service is temporarily unavailable. Try again shortly.')
 return data
}
function approvalFrom(data:unknown):GiftApproval{
 const item=(data as {approval?:GiftApproval})?.approval
 if(!item||typeof item.id!=='string'||!['authorizing','awaiting_approval','authorization_unknown'].includes(item.phase)||item.challengeId!==undefined&&typeof item.challengeId!=='string')throw Error('Gift approval response was invalid.')
 return item
}
export async function preparePocketGiftClaim(input:Options&{link:string;session:CircleEvmEmailSession}){
 const link=parseGiftLink(input.link)
 if(!link)throw Error('Open a valid Pocket gift link.')
 const data=await postGift({action:'prepare-claim',id:link.id},input),claim=data.claim as {chainId:number;escrow:Address;giftId:Hex;recipient:Address;deadline:string}
 if(!claim||claim.chainId!==CHAIN_META[input.session.chain].chainId||!isAddress(claim.recipient)||claim.recipient.toLowerCase()!==input.session.wallet.address.toLowerCase()||!/^\d{1,20}$/.test(claim.deadline))throw Error('Open the Pocket wallet for this gift network.')
 const signature=await signGiftClaim(link.secret,{...claim,deadline:BigInt(claim.deadline)})
 // Deliberately send only the bound signature, never the link or bearer capability.
 return approvalFrom(await postGift({action:'authorize-claim',id:link.id,signature,deadline:claim.deadline,userToken:input.session.userToken},input))
}
export async function preparePocketGiftFunding(input:Options&{id:string;session:CircleEvmEmailSession}){
 const result=await postGift({action:'authorize-funding',id:input.id,userToken:input.session.userToken},input)
 if(result.gift?.network!==input.session.chain)throw Error('Open the Pocket wallet for this gift network.')
 return approvalFrom(result)
}
export async function approvePocketGift(input:{approval:GiftApproval;session:CircleEvmEmailSession}){
 if(input.approval.phase!=='awaiting_approval'||!input.approval.challengeId)throw Error('Wallet approval is still being prepared. Try again shortly.')
 const {executeCircleEvmEmailChallenge}=await import('../../lib/circleEvmEmailWallet')
 return executeCircleEvmEmailChallenge({session:input.session,challengeId:input.approval.challengeId,pendingMessage:'Your gift approval is still being checked. Reopen the gift to check its status.'})
}
export async function readPocketGiftClaimStatus(input:Options&{id:string;transactionHash?:Hex}){
 const data=await postGift({action:'claim-status',id:input.id,...(input.transactionHash?{transactionHash:input.transactionHash}:{})},input)
 if(!['confirmed','claimed_elsewhere','confirming','funding','available','expired','refunded'].includes(data.status))throw Error('Gift status response was invalid.')
 if(data.status==='confirmed'&&!/^0x[0-9a-fA-F]{64}$/.test(data.transactionHash??''))throw Error('Gift confirmation is still being checked.')
 return {status:data.status as 'confirmed'|'claimed_elsewhere'|'confirming'|'funding'|'available'|'expired'|'refunded',transactionHash:data.transactionHash as Hex|undefined}
}

export async function preparePocketGiftRefund(input:Options&{id:string;session:CircleEvmEmailSession}){
 const result=await postGift({action:'authorize-refund',id:input.id,userToken:input.session.userToken},input)
 if(result.gift?.network!==input.session.chain)throw Error('Open the Pocket wallet for this gift network.')
 return approvalFrom(result)
}