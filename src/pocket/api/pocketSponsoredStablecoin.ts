import {xLayerFeeAssets,type XLayerFeeAsset} from '../lib/pocketXLayerFeeAssets'
import {encodeFunctionData,isAddress,parseAbi,type Address} from 'viem'
import {evmFeeTransfers,type FeeRouting} from '../../lib/platformFees'
import {makeSponsoredBatchRequest,SponsoredTransferNotSubmitted} from '../lib/pocketSponsoredRequest'
import {sponsoredTransferRequest} from './pocketSponsoredTransfer'

export type StablecoinIntent={merchantPaymentId?:string;asset:XLayerFeeAsset;recipient:Address;amountUnits:string}
export type SponsoredStablecoinQuote=FeeRouting & {owner:Address;attemptId:string;intent:StablecoinIntent;quoteToken:string;feeUnits:string;totalUnits:string;expiresAt:number;request:ReturnType<typeof makeSponsoredBatchRequest>}
type Dependencies={getAccessToken():Promise<string|null>;assertCurrent():void;fetcher?:typeof fetch}
const tokens=Object.fromEntries(Object.entries(xLayerFeeAssets).map(([symbol,a])=>[symbol,a.address])) as Record<XLayerFeeAsset,Address>
const abi=parseAbi(['function transfer(address,uint256) returns(bool)'])
const units=(v:unknown):v is string=>typeof v==='string'&&/^[1-9]\d{0,77}$/.test(v)&&BigInt(v)<2n**256n
const canonical=(value:any):string=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)
// Allow bounded server/browser clock skew on the future-window check only.
// Expired quotes remain invalid; the server enforces the signed 30-second lifetime.
const QUOTE_CLOCK_SKEW_MS = 5_000
export function validateSponsoredStablecoinQuote(q:SponsoredStablecoinQuote,now=Date.now()){
 const fail=()=>{throw new SponsoredTransferNotSubmitted('Transfer quote changed or expired. Review the transfer again.')}
 if(!q||!isAddress(q.owner)||!q.intent||!isAddress(q.intent.recipient)||q.intent.recipient.toLowerCase()===q.owner.toLowerCase()||!tokens[q.intent.asset]||(!q.intent.merchantPaymentId&&!['USDC','USDT'].includes(q.intent.asset))||!units(q.intent.amountUnits)||!units(q.feeUnits)||!units(q.totalUnits)||(BigInt(q.totalUnits)!==BigInt(q.intent.amountUnits)+(q.intent.merchantPaymentId?0n:BigInt(q.feeUnits))||q.intent.merchantPaymentId&&BigInt(q.feeUnits)>=BigInt(q.intent.amountUnits))||!Number.isSafeInteger(q.expiresAt)||q.expiresAt<=now||q.expiresAt>now+30000+QUOTE_CLOCK_SKEW_MS||typeof q.quoteToken!=='string'||!q.quoteToken||q.quoteToken.length>60000||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q.attemptId))return fail()
 const walletId=q.request?.url?.match(/^https:\/\/api\.privy\.io\/v1\/wallets\/([a-zA-Z0-9]{10,64})\/rpc$/)?.[1]
 const appId=q.request?.headers?.['privy-app-id']
 if(!walletId||typeof appId!=='string'||!appId)return fail()
 const platform=q.intent.merchantPaymentId?BigInt(q.intent.amountUnits)*25n/10000n:0n
 const calls=[{to:tokens[q.intent.asset],value:'0x0' as const,data:encodeFunctionData({abi,functionName:'transfer',args:[q.intent.recipient,BigInt(q.intent.amountUnits)-(q.intent.merchantPaymentId?BigInt(q.feeUnits):0n)]})},...evmFeeTransfers(q,platform,BigInt(q.feeUnits)-platform).map(f=>({to:tokens[q.intent.asset],value:'0x0' as const,data:encodeFunctionData({abi,functionName:'transfer',args:[f.recipient,f.units]})}))]
 const expected=makeSponsoredBatchRequest({appId,walletId,attemptId:q.attemptId,expiresAt:q.expiresAt,calls})
 // Address casing may differ in the server's checksum formatting.
 const actual=structuredClone(q.request)
 if(!Array.isArray(actual.body?.params?.calls))return fail()
 for(const c of actual.body.params.calls){if(typeof c.to!=='string')return fail();c.to=c.to.toLowerCase()}
 if(canonical(actual)!==canonical(expected))return fail()
}
export async function quoteSponsoredStablecoin(owner:Address,intent:StablecoinIntent,deps:Dependencies,attemptId:string=crypto.randomUUID()):Promise<SponsoredStablecoinQuote>{
 const captured=structuredClone(intent)
 const result=await sponsoredTransferRequest({action:'quote',wallet:owner,intent:captured,attemptId},deps.getAccessToken,deps.fetcher).catch(error=>{
  if(error instanceof SponsoredTransferNotSubmitted)throw error
  throw new SponsoredTransferNotSubmitted('Could not check the network fee. Review the transfer again.')
 })
 deps.assertCurrent()
 const quote={...result,owner,intent:captured,attemptId} as SponsoredStablecoinQuote
 validateSponsoredStablecoinQuote(quote)
 return quote
}
// Called only after PIN approval. The reviewed quote was validated before PIN;
// refresh its signing window without increasing the debit the user approved.
export async function refreshApprovedStablecoinQuote(approved:SponsoredStablecoinQuote,deps:Dependencies){
 const captured=structuredClone(approved)
 deps.assertCurrent()
 const fresh=await quoteSponsoredStablecoin(captured.owner,captured.intent,deps,captured.attemptId)
 if(fresh.owner!==captured.owner||canonical(fresh.intent)!==canonical(captured.intent)
   ||fresh.request.url!==captured.request.url||fresh.request.headers['privy-app-id']!==captured.request.headers['privy-app-id']
   ||BigInt(fresh.feeUnits)>BigInt(captured.feeUnits)||BigInt(fresh.totalUnits)>BigInt(captured.totalUnits))
   throw new SponsoredTransferNotSubmitted('Network fee or wallet changed. Review the transfer again.')
 return fresh
}
export async function sendSponsoredStablecoin(approved:SponsoredStablecoinQuote,deps:Dependencies&{sign(request:SponsoredStablecoinQuote['request']):Promise<{signature:string}>}){
 let dispatched=false
 try{
  const quote=structuredClone(approved)
  deps.assertCurrent();validateSponsoredStablecoinQuote(quote)
  const {signature}=await deps.sign(structuredClone(quote.request))
  deps.assertCurrent();validateSponsoredStablecoinQuote(quote)
  dispatched=true
  const result=await sponsoredTransferRequest({action:'send',wallet:quote.owner,intent:quote.intent,quoteToken:quote.quoteToken,request:quote.request,signature},deps.getAccessToken,deps.fetcher)
  if(result.hash&&/^0x[0-9a-f]{64}$/i.test(result.hash))return {hash:result.hash}
  throw Error('This transfer is being checked in Activity.')
 }catch(error){if(!dispatched&&!(error instanceof SponsoredTransferNotSubmitted))throw new SponsoredTransferNotSubmitted('Transfer was not sent. Review it again.');throw error}
}
