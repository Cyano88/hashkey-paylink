import type {Request,Response} from 'express'
import {createHash} from 'node:crypto'
import {verifiedPrivyUser,circleLinkKey,readCircleLink} from './privy-circle-link.js'
import {readBscWallet} from './pocket/bsc-wallet.js'
import {verifyStockWalletOwner} from './pocket/xstocks-wallet-owner.js'
import {readReceiptCheckout} from './checkout-receipts.js'
import {readDeveloperReceiptSettings} from './developer-receipt-settings.js'
import {readDurableJson,mutateDurableJson} from './render-durable-store.js'

export const RECEIPT_CONTACT_KEY='hashpaylink:checkout-receipt-contacts:v1'
export type ReceiptContact={checkoutId:string;projectId:string;owner:string;email:string;payer:string;network:string;createdAt:number;expiresAt:number}
type Store={contacts:Record<string,ReceiptContact>}
export const readReceiptContacts=async()=> (await readDurableJson<Store>(RECEIPT_CONTACT_KEY))?.contacts||{}
async function owns(owner:string,network:string,payer:string){
 if(network==='xlayer'){await verifyStockWalletOwner(owner,payer);return true}
 if(network==='bsc')return (await readBscWallet(owner))?.address.toLowerCase()===payer.toLowerCase()
 if(!['base','arc','arbitrum','ethereum','polygon','solana'].includes(network))return false
 const link=await readCircleLink(circleLinkKey(owner,network,'payment'))
 return Boolean(link&&link.privyUserId===owner&&link.chain===network&&(network==='solana'?link.circleWalletAddress===payer:link.circleWalletAddress.toLowerCase()===payer.toLowerCase()))
}
const defaults={identity:verifiedPrivyUser,checkout:readReceiptCheckout,settings:readDeveloperReceiptSettings,owns,now:Date.now,
 mutate:(fn:(s:Store)=>Store)=>mutateDurableJson<Store>(RECEIPT_CONTACT_KEY,s=>fn(s||{contacts:{}}))}
export function createCheckoutReceiptContactHandler(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 return async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed.'})
  try{
   const identity=await d.identity(req),id=typeof req.body?.checkoutId==='string'?req.body.checkoutId:'',network=String(req.body?.network||''),payer=String(req.body?.payer||'')
   if(!/^chk[xb]?_[a-zA-Z0-9]{8,40}$/.test(id)||payer.length>100) return res.status(400).json({ok:false,error:'Invalid checkout receipt details.'})
   const checkout=await d.checkout(id)
   if(!checkout||checkout.checkoutMode==='agentic')return res.status(404).json({ok:false,error:'Checkout not found.'})
   const settings=await d.settings(checkout.partnerId)
   if(!settings||!identity.email)return res.json({ok:true,enabled:false})
   // Never attach a new recipient to an already-paid or expired checkout.
   if(checkout.payment||Date.parse(checkout.expiresAt)<=d.now())return res.json({ok:true,enabled:false})
   const networks='paymentOptions' in checkout&&checkout.paymentOptions?.length?checkout.paymentOptions.map(p=>p.network):[checkout.network]
   if(!networks.some(value=>value===network)||!payer||!await d.owns(identity.userId,network,payer))return res.status(403).json({ok:false,error:'Use your verified payment wallet for this receipt.'})
   const address=network==='solana'?payer:payer.toLowerCase(),key=createHash('sha256').update(id+'|'+network+'|'+address).digest('hex')
   await d.mutate(s=>{
    const previous=s.contacts[key]
    if(previous&&previous.owner!==identity.userId)throw Object.assign(Error('Receipt account changed. Reopen checkout.'),{status:409})
    for(const[k,c]of Object.entries(s.contacts))if(c.expiresAt+30*86400000<d.now())delete s.contacts[k]
    s.contacts[key]??={checkoutId:id,projectId:checkout.partnerId,owner:identity.userId,email:identity.email!,payer:address,network,createdAt:d.now(),expiresAt:Date.parse(checkout.expiresAt)}
    return s
   })
   return res.json({ok:true,enabled:true})
  }catch(error){const status=(error as {status?:number}).status||503;return res.status(status).json({ok:false,error:status<500?(error as Error).message:'Receipt setup is temporarily unavailable. Try again.'})}
 }
}
export default createCheckoutReceiptContactHandler()
