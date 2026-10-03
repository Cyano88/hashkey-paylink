import type {StockGiftIntent} from './pocketStockGiftIntent'
import type {MultiGiftAsset} from '../features/gifts/pocketMultiGift'
export type StockGiftSession={chain:'xlayer';wallet:{address:Address};userToken:'xstocks';signGift(intent:StockGiftIntent):Promise<Hex>;recoverFunding(id:string):Promise<{retryAllowed:boolean}>;reconcile(id:string,operation:'funding'|'claim'|'refund',hash:Hex):void}
export type GiftWalletSession=CircleEvmEmailSession|StockGiftSession
import type {Address,Hex} from 'viem'
import {isAddress} from 'viem'
import {CHAIN_META} from '../../lib/chains'
import type {CircleEvmEmailSession} from '../../lib/circleEvmEmailWallet'
import {pocketApiUrl} from '../lib/pocketRoutes'
import {parseGiftLink} from '../features/gifts/pocketGift'
import {signGiftClaim,signMultiGiftClaim} from '../features/gifts/pocketGiftSigning'
export type GiftApproval={id:string;phase:'authorizing'|'awaiting_approval'|'authorization_unknown';challengeId?:string;transactionId?:string;execution?:StockGiftIntent}
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
export async function preparePocketGiftClaim(input:Options&{link:string;session:GiftWalletSession}){
 const link=parseGiftLink(input.link)
 if(!link)throw Error('Open a valid Pocket gift link.')
 const data=await postGift({action:'prepare-claim',id:link.id},input),claim=data.claim as {version?:2;accountId?:Hex;chainId:number;escrow:Address;giftId:Hex;recipient:Address;deadline:string}
 if(!claim||claim.chainId!==(input.session.chain==='xlayer'?196:CHAIN_META[input.session.chain].chainId)||!isAddress(claim.recipient)||claim.recipient.toLowerCase()!==input.session.wallet.address.toLowerCase()||!/^\d{1,20}$/.test(claim.deadline))throw Error('Open the Pocket wallet for this gift network.')
 if(claim.version!==undefined&&claim.version!==2)throw Error('Unsupported gift version.');
 const signature=claim.version===2?await signMultiGiftClaim(link.secret,{...claim,accountId:claim.accountId!,deadline:BigInt(claim.deadline)}):await signGiftClaim(link.secret,{...claim,deadline:BigInt(claim.deadline)})
 // Deliberately send only the bound signature, never the link or bearer capability.
 const approval=approvalFrom(await postGift({action:'authorize-claim',id:link.id,signature,deadline:claim.deadline,userToken:input.session.userToken},input))
 if(input.session.chain==='xlayer'){
  const e=approval.execution
  if(!e||e.kind!=='claim'||e.id!==link.id||e.giftId!==claim.giftId||e.escrow.toLowerCase()!==claim.escrow.toLowerCase()||!e.claim||e.claim.accountId!==claim.accountId||e.claim.deadline!==claim.deadline||e.claim.signature!==signature||e.claim.recipient.toLowerCase()!==claim.recipient.toLowerCase())throw Error('Gift claim approval changed.')
 }
 return approval
}
export async function preparePocketGiftFunding(input:Options&{id:string;session:GiftWalletSession}){
 const result=await postGift({action:'authorize-funding',id:input.id,userToken:input.session.userToken},input)
 if(result.gift?.network!==input.session.chain)throw Error('Open the Pocket wallet for this gift network.')
 const approval=approvalFrom(result)
 if(input.session.chain==='xlayer'&&(approval.execution?.id!==input.id||approval.execution.kind!=='funding'))throw Error('Gift funding approval changed.')
 return approval
}
export async function approvePocketGift(input:{approval:GiftApproval;session:GiftWalletSession}){
 if(input.approval.phase!=='awaiting_approval'||!input.approval.challengeId)throw Error('Wallet approval is still being prepared. Try again shortly.')
 if(input.session.chain==='xlayer'){
  if(!input.approval.execution||input.approval.execution.attemptId!==input.approval.id)throw Error('Stock gift approval is invalid.')
  const transactionHash=await input.session.signGift(input.approval.execution)
  return {transactionHash}
 }
 if(input.approval.execution)throw Error('Wrong gift wallet.')
 const {executeCircleEvmEmailChallenge}=await import('../../lib/circleEvmEmailWallet')
 return executeCircleEvmEmailChallenge({session:input.session,challengeId:input.approval.challengeId,pendingMessage:'Your gift approval is still being checked. Reopen the gift to check its status.'})
}
export async function readPocketGiftClaimStatus(input:Options&{id:string;transactionHash?:Hex}){
 const data=await postGift({action:'claim-status',id:input.id,...(input.transactionHash?{transactionHash:input.transactionHash}:{})},input)
 if(!['confirmed','claimed_elsewhere','confirming','funding','available','expired','refunded'].includes(data.status))throw Error('Gift status response was invalid.')
 if(data.status==='confirmed'&&!/^0x[0-9a-fA-F]{64}$/.test(data.transactionHash??''))throw Error('Gift confirmation is still being checked.')
 return {status:data.status as 'confirmed'|'claimed_elsewhere'|'confirming'|'funding'|'available'|'expired'|'refunded',transactionHash:data.transactionHash as Hex|undefined,retryAllowed:data.status==='available'&&data.retryAllowed===true}
}

export async function preparePocketGiftRefund(input:Options&{id:string;session:GiftWalletSession}){
 const result=await postGift({action:'authorize-refund',id:input.id,userToken:input.session.userToken},input)
 if(result.gift?.network!==input.session.chain)throw Error('Open the Pocket wallet for this gift network.')
 const approval=approvalFrom(result)
 if(input.session.chain==='xlayer'&&(approval.execution?.id!==input.id||approval.execution.kind!=='refund'))throw Error('Gift refund approval changed.')
 return approval
}
export async function readPocketGift(id:string,fetcher:typeof fetch=fetch):Promise<import('../features/gifts/pocketGift').GiftView>{
 if(!/^g_[A-Za-z0-9_-]{22}$/.test(id))throw Error('Open a valid Pocket gift link.')
 const response=await fetcher(pocketApiUrl('/api/pocket/gifts')+'?id='+encodeURIComponent(id),{cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)})
 const data=await response.json().catch(()=>undefined),gift=data?.gift
 if(!response.ok||!data?.ok||!gift||gift.id!==id||typeof gift.sender!=='string'||typeof gift.message!=='string'||gift.message.length>160||!['base','arbitrum','arc','polygon','ethereum','xlayer'].includes(gift.network)||!['funding','available','claimed','expired','refunded'].includes(gift.status)||typeof gift.amount!=='string')throw Error('This gift could not be loaded. Try again shortly.')
 const {giftAssetUnits}=await import('../features/gifts/pocketGift')
 if(gift.network==='xlayer'&&(!gift.asset||gift.version!==2)||gift.network!=='xlayer'&&gift.asset)throw Error('Invalid gift asset.')
 giftAssetUnits(gift.amount,gift.asset)
 if(gift.version===2&&(!Number.isSafeInteger(gift.maxClaims)||gift.maxClaims<1||gift.maxClaims>1000||!Number.isSafeInteger(gift.remainingClaims)||gift.remainingClaims<0||gift.remainingClaims>gift.maxClaims))throw Error('Invalid gift claim count.');
 return {...(gift.asset?{asset:gift.asset}:{}),...(gift.version===2?{maxClaims:gift.maxClaims,remainingClaims:gift.remainingClaims}:{}),sender:gift.sender,amount:gift.amount,message:gift.message,network:gift.network,status:gift.status}
}

export type PocketGiftConfig={sendEnabled:boolean;claimEnabled:boolean;network:'base';maxRecipients?:number;stockAssets?:MultiGiftAsset[];stockMaxRecipients?:number;stockClaimEnabled?:boolean}
export async function readPocketGiftConfig(fetcher:typeof fetch=fetch,accessToken?:string|null):Promise<PocketGiftConfig>{
 const response=await fetcher(pocketApiUrl('/api/pocket/gifts')+'?action=config',{cache:'no-store',headers:accessToken?{Authorization:'Bearer '+accessToken}:undefined,signal:AbortSignal.timeout(10000)})
 const data=await response.json().catch(()=>undefined)
 if(!response.ok||!data?.ok||data.network!=='base'||typeof data.sendEnabled!=='boolean'||typeof data.claimEnabled!=='boolean')throw Error('Gifts are temporarily unavailable.')
 if(data.maxRecipients!==undefined&&(!Number.isSafeInteger(data.maxRecipients)||data.maxRecipients<1||data.maxRecipients>1000))throw Error('Invalid gift configuration.');
 return {sendEnabled:data.sendEnabled,claimEnabled:data.claimEnabled,network:'base',maxRecipients:data.maxRecipients??1,stockAssets:Array.isArray(data.stockAssets)?data.stockAssets:[],stockMaxRecipients:data.stockMaxRecipients===1000?1000:1,stockClaimEnabled:data.stockClaimEnabled===true}
}
export async function readPocketGiftOwner(input:Options&{id:string}){
 const data=await postGift({action:'owner-status',id:input.id},input)
 if(data.gift?.id!==input.id||!['base','xlayer'].includes(data.gift?.network)||!['funding','available','claimed','expired','refunded'].includes(data.gift?.status))throw Error('Gift status is unavailable.')
 return data as {proof?:{funding?:Hex;refund?:Hex};canDelete?:boolean;createdAt?:number;fundingExpired?:boolean;gift:{id:string;maxClaims?:number;remainingClaims?:number;status:'funding'|'available'|'claimed'|'expired'|'refunded'};funding:{principal:string;platformFee:string;totalDebit:string}}
}
export async function createPocketGift(input:Options&{draft:import('../features/gifts/giftDraftVault').SavedGiftDraft}){
 const d=input.draft
 const data=d.giftId?await readPocketGiftOwner({...input,id:d.giftId}):await postGift({action:'create',requestId:d.requestId,network:d.network,...(d.asset?{token:d.asset.token}:{}),amount:d.amount,message:d.message,expiresAt:d.expiresAt,claimSigner:d.signer,...(d.version===2?{claims:String(d.claims)}:{})},input)
 if(!/^g_[A-Za-z0-9_-]{22}$/.test(data.gift?.id||'')||!data.funding||![data.funding.principal,data.funding.platformFee,data.funding.totalDebit].every(x=>typeof x==='string'&&/^\d+$/.test(x)))throw Error('Gift funding details are unavailable.')
 return {id:data.gift.id,...data.funding} as import('../features/gifts/giftFundingController').GiftFundingReview
}

export async function recoverPocketGiftFunding(input:Options&{id:string;session:GiftWalletSession}){
 if(input.session.chain==='xlayer'){const status=await readPocketGiftOwner(input);if(status.gift.status!=='funding'||status.fundingExpired)return {retryAllowed:false};return input.session.recoverFunding(input.id)}
 const result=await postGift({action:'recover-funding',id:input.id,userToken:input.session.userToken},input)
 if(result.gift?.id!==input.id||result.gift?.network!==input.session.chain||typeof result.retryAllowed!=='boolean')throw Error('Gift recovery could not be verified.')
 return {retryAllowed:result.retryAllowed}
}

export async function issuePocketGiftCode(input:Options&{id:string;secret:string}) {
 const data=await postGift({action:'issue-code',id:input.id,secret:input.secret},input)
 if(typeof data.code!=='string'||! /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(data.code))throw Error('Gift code could not be loaded.')
 return data.code as string
}
export async function resolvePocketGiftCode(input:Options&{code:string}) {
 const data=await postGift({action:'resolve-code',code:input.code},input)
 if(data.status==='claimed'){
  const claimedGift=await readPocketGift(data.id)
  if(claimedGift.status!=='claimed')throw Error('Gift status could not be confirmed. Try again.')
  return {claimedGift}
 }
 if(typeof data.link!=='string'||!parseGiftLink(data.link))throw Error('Gift code could not be verified.')
 return data.link as string
}

export async function discardPocketGiftDraft(input:Options&{id:string}){const result=await postGift({action:'discard-draft',id:input.id},input);if(result.deleted!==true)throw Error('The draft could not be deleted.')}

export async function readPocketStockGiftHistory(getAccessToken:()=>Promise<string|null>){
 const token=await getAccessToken();if(!token)throw Error('Sign in to view gifts.')
 const response=await fetch(pocketApiUrl('/api/pocket/gifts')+'?action=stock-history',{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(10000)})
 const data=await response.json();if(!response.ok||!data.ok||!Array.isArray(data.rows)||data.rows.some((r:any)=>r.chain!=='xlayer'||r.source!=='gift'))throw Error('Gift activity could not refresh.')
 return data.rows as import('../models/pocketActivity').PocketActivityRow[]
}
