import {marketplaceReceiptNames} from './receipt-branding.js'
import {PrivyClient} from '@privy-io/server-auth'
import {createHash} from 'node:crypto'
import {readDurableJson,mutateDurableJson,queryDurablePostgres,hasRenderDurableStore} from '../render-durable-store.js'
import {readDeveloperReceiptSettings} from '../developer-receipt-settings.js'
import {queuePreparedReceiptEmail} from '../checkout-receipt-emails.js'
import {marketplaceSettlementReceipts,type MarketplaceSettlementReceipt} from './settlement-receipts.js'
import {marketplaceReceiptEmail,marketplaceReceiptPdf} from './receipt-document.js'
import type {MarketplaceStore} from './repository.js'
const ACTIVATION='hashpaylink:marketplace-receipt-email-activation:v1'
/** Wallet links are server-verified identities. Never substitute project owner email. */
export async function marketplaceReceiptRecipient(r:MarketplaceSettlementReceipt){
 if(r.settlement==='bank'){
  if(!r.sellerId)return null
  const identities=await readDurableJson<import('./seller-identity.js').SellerIdentityStore>('hashpaylink:marketplace-seller-identities:v1'),links=identities?.links.filter(l=>l.projectId===r.projectId&&l.sellerId===r.sellerId&&!l.revokedAt)??[]
  const appId=process.env.PRIVY_APP_ID||process.env.VITE_PRIVY_APP_ID,secret=process.env.PRIVY_APP_SECRET
  if(links.length!==1||!appId||!secret)return null
  const user=await new PrivyClient(appId,secret).getUserById(links[0].owner),emails=user.linkedAccounts.filter(a=>a.type==='email'&&a.latestVerifiedAt instanceof Date&&Number.isFinite(a.latestVerifiedAt.getTime()))
  return emails.length===1&&emails[0].type==='email'?emails[0].address:null
 }

 const found=await queryDurablePostgres<{privy_user_id:string;email:string;circle_wallet_address:string}>("select privy_user_id,email,circle_wallet_address from privy_circle_links where chain='base' and coalesce(purpose,'payment')='payment' and lower(circle_wallet_address)=lower($1)",[r.recipient])
 const recipients=new Set(found.rows.filter(row=>row.email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)).map(row=>row.privy_user_id+'|'+row.email.toLowerCase()))
 if(recipients.size!==1||found.rows.some(row=>!row.privy_user_id||!row.email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)))return null
 const [owner,email]=[...recipients][0].split('|')
 const appId=process.env.PRIVY_APP_ID||process.env.VITE_PRIVY_APP_ID,secret=process.env.PRIVY_APP_SECRET
 if(!appId||!secret)return null
 // Legacy link emails could be client supplied; confirm against the identity provider.
 const user=await new PrivyClient(appId,secret).getUserById(owner)
 return user.linkedAccounts.some(a=>a.type==='email'&&a.address.toLowerCase()===email&&a.latestVerifiedAt instanceof Date&&Number.isFinite(a.latestVerifiedAt.getTime()))?email:null
}
const defaults={names:marketplaceReceiptNames,enabled:()=>hasRenderDurableStore()&&process.env.CHECKOUT_RECEIPT_EMAIL_ENABLED==='true',now:Date.now,activation:()=>mutateDurableJson<{startedAt:number}>(ACTIVATION,old=>old||{startedAt:Date.now()}),read:()=>readDurableJson<MarketplaceStore>('hashpaylink:marketplace-accounting-foundation:v1'),queued:async()=>new Set(Object.keys((await readDurableJson<{jobs:Record<string,unknown>}>('hashpaylink:checkout-receipt-emails:v1'))?.jobs||{})),settings:readDeveloperReceiptSettings,recipient:marketplaceReceiptRecipient,queue:queuePreparedReceiptEmail,pdf:marketplaceReceiptPdf}
let running=false
export async function reconcileMarketplaceReceiptEmails(d=defaults){
 if(!d.enabled()||running)return
 running=true
 try{
  const {startedAt}=await d.activation(),receipts=marketplaceSettlementReceipts(await d.read()),queued=await d.queued()
  const names=d.names?await d.names():{}
  // Activation is durable: deployment/restarts do not email historical payments.
  let prepared=0
  for(const r of receipts.filter(r=>r.settledAt>=startedAt&&!queued.has(createHash('sha256').update(r.id).digest('hex')))){
   if(prepared>=100)break
   if(!await d.settings(r.projectId))continue
   // Identity/provider failures for one recipient must not block unrelated receipts.
   const to=await d.recipient(r).catch(()=>null);if(!to)continue
   r.marketplaceName=names[r.projectId]
   const pdf=await d.pdf(r)
   prepared++
   await d.queue(r.id,r.projectId,{to,fromName:'Hash PayLink',...marketplaceReceiptEmail(r),context:'marketplace '+r.kind+' receipt',attachments:[{filename:r.id+'.pdf',content:pdf.toString('base64'),content_type:'application/pdf'}]})
  }
 }finally{running=false}
}
