import {parseUnits} from 'viem'
import {bscSendRequest,validateBscSend,type BscSendQuote} from './pocketBscSend'
export type BscSendReview={quote:BscSendQuote;quoteToken:string;balanceUnits:string}
export type BscSendResult={operationId:string;state:string;quote:BscSendQuote;hash?:string}
export function createBscSendClient(d:{appId:string;owner:string;identity():Promise<string>;request(body:Record<string,unknown>,approval?:string):Promise<any>;sign(request:ReturnType<typeof bscSendRequest>):Promise<string>}){
 const verify=async(q:BscSendQuote,recovery=false)=>{
  validateBscSend(q,Date.now(),recovery)
  if(q.ownerId!==d.owner||q.walletAddress.toLowerCase()!==(await d.identity()).toLowerCase())throw Error('Reconnect your Pocket wallet.')
 }
 return {
  async quote(asset:'USDC'|'USDT',recipient:string,amount:string){
   const value:BscSendReview=await d.request({action:'quote',asset,recipient,amount});await verify(value.quote)
   if(value.quote.amountUnits!==String(parseUnits(amount,18))||value.quote.asset!==asset||value.quote.recipient.toLowerCase()!==recipient.toLowerCase()||!/^\d+$/.test(value.balanceUnits))throw Error('Transfer details changed. Review the transfer again.')
   return value
  },
  async recover(operationId:string):Promise<BscSendResult>{
   let value=await d.request({action:'status',operationId});await verify(value.quote,true)
   // An interrupted unsigned preparation can be released, never re-signed silently.
   if(value.state==='prepared')value=await d.request({action:'cancel',operationId})
   return value
  },
  async execute(value:BscSendReview,approval:string,onPrepared:(id:string)=>void):Promise<BscSendResult>{
   await verify(value.quote)
   // Persist the known quote ID before preparation; a lost response is recoverable.
   onPrepared(value.quote.id)
   const prepared=await d.request({action:'prepare',quoteToken:value.quoteToken},approval)
   await verify(prepared.quote,true)
   if(prepared.operationId!==value.quote.id||JSON.stringify(prepared.quote)!==JSON.stringify(value.quote))throw Error('Transfer details changed. Review the transfer again.')
   if(prepared.state!=='prepared')return prepared
   let authorization:string
   try{
    const canonical=bscSendRequest(value.quote,d.appId)
    if(JSON.stringify(canonical)!==JSON.stringify(prepared.request))throw Error('Transfer details changed. Review the transfer again.')
    authorization=await d.sign(structuredClone(canonical));await verify(value.quote)
   }catch(error){
    const cancelled=await d.request({action:'cancel',operationId:value.quote.id})
    if(cancelled.state==='cancelled')return cancelled
    throw error
   }
   // Exactly one dispatch. Errors keep the operation for status-only recovery.
   return d.request({action:'submit',operationId:value.quote.id,authorization})
  },
 }
}
