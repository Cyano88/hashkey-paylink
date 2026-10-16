import type {Address,Hex} from 'viem'
import {pocketApiUrl} from '../lib/pocketRoutes'
import {makeSponsoredRequest,SponsoredTransferNotSubmitted,type SponsoredRequest} from '../lib/pocketSponsoredRequest'
type Dependencies={getAccessToken():Promise<string|null>;sign(request:SponsoredRequest):Promise<{signature:string}>;fetcher?:typeof fetch;assertCurrent():void}
export async function sponsoredTransferRequest(body:unknown,getAccessToken:Dependencies['getAccessToken'],fetcher:typeof fetch=fetch){
 const token=await getAccessToken();if(!token)throw Error('Sign in to Pocket again.')
 const response=await fetcher(pocketApiUrl('/api/pocket/xlayer/sponsorship'),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body),signal:AbortSignal.timeout(40000),cache:'no-store'})
 const result=await response.json().catch(()=>null)
 if(!response.ok||!result?.ok){if(result?.code==='pocket_sponsor_not_submitted'&&((body as {action?:string})?.action!=='status'||response.status===422))throw new SponsoredTransferNotSubmitted(typeof result.error==='string'?result.error:'Transfer was not sent.');throw Error('This transfer is being checked in Activity.')}
 return result as {appId?:string;walletId?:string;hash?:Hex|null;accepted?:boolean}
}
export async function sendSponsoredTransfer(input:{owner:Address;to:Address;data:Hex;attemptId:string;earn?:{action:'approve'|'deposit'|'withdraw';symbol:string;amount:string}},deps:Dependencies):Promise<{hash:Hex}>{
 let dispatched=false
 try{
  const purpose=input.earn?{purpose:'earn',intent:input.earn}:{}
  const prepared=await sponsoredTransferRequest({action:'prepare',wallet:input.owner,...purpose},deps.getAccessToken,deps.fetcher)
  if(!prepared.appId||!prepared.walletId)throw Error('Sponsorship unavailable.')
  deps.assertCurrent()
  const request=makeSponsoredRequest({appId:prepared.appId,walletId:prepared.walletId,attemptId:input.attemptId,expiresAt:Date.now()+90000,from:input.owner,to:input.to,data:input.data})
  const {signature}=await deps.sign(request);deps.assertCurrent()
  // Once dispatched, a lost response must be reconciled with the same attempt ID.
  dispatched=true
  const result=await sponsoredTransferRequest({action:'send',wallet:input.owner,request,signature,...purpose},deps.getAccessToken,deps.fetcher)
  if(result.hash&&/^0x[0-9a-f]{64}$/i.test(result.hash))return {hash:result.hash}
  throw Error('This transfer is being checked in Activity.')
 }catch(error){if(!dispatched&&!(error instanceof SponsoredTransferNotSubmitted))throw new SponsoredTransferNotSubmitted('Transfer was not sent. Please review it again.');throw error}
}
