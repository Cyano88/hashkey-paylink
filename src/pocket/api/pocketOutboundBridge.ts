import {encodeFunctionData,isAddress,parseAbi,parseUnits,type Address} from 'viem'
import {EVM_PLATFORM_TREASURY} from '../../lib/platformFees'
import {makeSponsoredBatchRequest,SponsoredTransferNotSubmitted} from '../lib/pocketSponsoredRequest'
import {sponsoredTransferRequest} from './pocketSponsoredTransfer'

export type OutboundBridgeQuote={id:string;rail:'xlayer';execution:'privy';source:'xlayer';destination:'base';asset:'USDC'|'USDT';walletAddress:Address;destinationAddress:Address;orderId:`0x${string}`;amount:string;receive:string;minimumReceive:string;networkFee:string;fee:string;total:string;expiresAt:number}
export type OutboundBridgeReview={quote:OutboundBridgeQuote;quoteToken:string;request:ReturnType<typeof makeSponsoredBatchRequest>}
export const outboundTokens={USDC:'0xb6ceceab302e2e4948951ee7843fc24e92933061',USDT:'0x779ded0c9e1022225f8e0630b35a9b54be713736'} as const
const depository='0x4cd00e387622c35bddb9b4c962c136462338bc31'
const abi=parseAbi(['function approve(address,uint256) returns(bool)','function depositErc20(address,address,uint256,bytes32)','function transfer(address,uint256) returns(bool)'])
const canonical=(v:unknown)=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x)
const amount=(v:string)=>{if(typeof v!=='string'||!/^\d{1,12}(\.\d{1,6})?$/.test(v))throw Error('Invalid amount');return parseUnits(v,6)}
export function validateOutboundBridge(review:OutboundBridgeReview,owner:Address,destination:Address,asset:'USDC'|'USDT',inputAmount:string,now=Date.now()){
 try{
  const q=review.quote
  if(q.rail!=='xlayer'||q.execution!=='privy'||q.source!=='xlayer'||q.destination!=='base'||q.asset!==asset||!isAddress(q.walletAddress)||q.walletAddress.toLowerCase()!==owner.toLowerCase()||!isAddress(q.destinationAddress)||q.destinationAddress.toLowerCase()!==destination.toLowerCase()||!/^0x[0-9a-f]{64}$/i.test(q.orderId)||!Number.isSafeInteger(q.expiresAt)||q.expiresAt<=now||q.expiresAt>now+30000||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q.id)||!review.quoteToken||review.quoteToken.length>60000)throw Error()
  const sent=amount(q.amount),fee=amount(q.networkFee),total=amount(q.total),received=amount(q.receive),minimum=amount(q.minimumReceive)
  if(sent!==amount(inputAmount)||sent<=0n||fee<=0n||total!==sent+fee||minimum<=0n||minimum>received||received>sent||amount(q.fee)!==total-received)throw Error()
  const token=outboundTokens[asset],approval=(units:bigint)=>({to:token,value:'0x0' as const,data:encodeFunctionData({abi,functionName:'approve',args:[depository,units]})})
  const calls=[approval(0n),approval(sent),{to:depository,value:'0x0' as const,data:encodeFunctionData({abi,functionName:'depositErc20',args:[owner,token,sent,q.orderId]})},approval(0n),{to:token,value:'0x0' as const,data:encodeFunctionData({abi,functionName:'transfer',args:[EVM_PLATFORM_TREASURY,fee]})}]
  const walletId=review.request.url.match(/^https:\/\/api\.privy\.io\/v1\/wallets\/([a-zA-Z0-9]{10,64})\/rpc$/)?.[1],appId=review.request.headers['privy-app-id']
  if(!walletId||!appId)throw Error()
  const expected=makeSponsoredBatchRequest({appId,walletId,attemptId:q.id,expiresAt:q.expiresAt,calls}),actual=structuredClone(review.request)
  actual.body.params.calls.forEach(c=>{c.to=c.to.toLowerCase()})
  if(canonical(actual)!==canonical(expected))throw Error()
 }catch{throw new SponsoredTransferNotSubmitted('Bridge quote changed or expired. Review it again.')}
}
export async function quoteOutboundBridge(input:{owner:Address;destination:Address;asset:'USDC'|'USDT';amount:string},getAccessToken:()=>Promise<string|null>){
 const result=await sponsoredTransferRequest({action:'quote',purpose:'bridge',wallet:input.owner,destination:'base',asset:input.asset,amount:input.amount},getAccessToken) as unknown as {quote:OutboundBridgeQuote;bridgeQuoteToken:string;request:OutboundBridgeReview['request']}
 const review={quote:result.quote,quoteToken:result.bridgeQuoteToken,request:result.request}
 validateOutboundBridge(review,input.owner,input.destination,input.asset,input.amount);return review
}
export async function sendOutboundBridge(review:OutboundBridgeReview,deps:{getAccessToken():Promise<string|null>;assertCurrent():void;sign(request:OutboundBridgeReview['request']):Promise<{signature:string}>;beforeDispatch():void;fetcher?:typeof fetch}){
 let dispatched=false
 try{
  const saved=structuredClone(review),q=saved.quote
  deps.assertCurrent();validateOutboundBridge(saved,q.walletAddress,q.destinationAddress,q.asset,q.amount)
  const {signature}=await deps.sign(structuredClone(saved.request))
  deps.assertCurrent();validateOutboundBridge(saved,q.walletAddress,q.destinationAddress,q.asset,q.amount)
  deps.beforeDispatch();dispatched=true
  return await sponsoredTransferRequest({action:'send',purpose:'bridge',wallet:q.walletAddress,bridgeQuoteToken:saved.quoteToken,request:saved.request,signature},deps.getAccessToken,deps.fetcher)
 }catch(error){if(!dispatched&&!(error instanceof SponsoredTransferNotSubmitted))throw new SponsoredTransferNotSubmitted('Bridge was not sent. Review it again.');throw error}
}
