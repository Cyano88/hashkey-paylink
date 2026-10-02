// Support reads saved records only. Do not call refresh, observe, repair or execution helpers here.
export type SupportFeature = 'requests'|'gifts'|'xpay'|'collections'
export type SupportFeatureRecord = {id:string;title:string;status:string;updatedAt:number;details?:string[]}
const text=(value:unknown,max=100)=>String(value??'').replace(/[\u0000-\u001f<>]/g,' ').slice(0,max)
const date=(value:number)=>Number.isFinite(value)&&value>0?new Date(value).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}):'Time unavailable'
const payment=(p:{amount:unknown;asset:unknown;state:unknown;createdAt:number;network?:string})=>{const n=Number(p.amount),amount=Number.isFinite(n)?n.toLocaleString('en-GB',{maximumFractionDigits:6}):text(p.amount,40);return (p.asset==='NGN'?'₦'+amount:amount+' '+text(p.asset,12))+' · '+text(p.state,30).replace(/^./,x=>x.toUpperCase())+' · '+date(p.createdAt)}
export async function readSupportFeatureRecords(owner:string,kind:SupportFeature,selected?:string):Promise<SupportFeatureRecord[]>{
 if(!owner)throw Error('Authenticated owner required')
 if(kind==='requests'){
  const {createPocketRequestRepository}=await import('./request-store.js')
  const repo=createPocketRequestRepository()
  const records=selected?[await repo.getFor(owner,selected)]:await repo.listFor(owner)
  return records.filter(r=>r.senderId===owner||r.recipientId===owner).slice(0,20).map(r=>({id:r.id,title:text(r.title)||'USDC request',status:r.status,updatedAt:r.updatedAt,details:[r.amount+' USDC · '+r.network,r.senderId===owner?'You requested this payment.':'This request was sent to you.',r.status==='accepted'?'Accepted does not mean paid.':r.status==='paid'?'Payment is recorded as paid.':'No completed payment is established by this request state.',...(r.route?['Payment route on record: '+r.route.phase]:[])]}))
 }
 if(kind==='gifts'){
  const {listCirclePocketActions}=await import('../circle-pocket-action-journal.js')
  const actions=(await Promise.all(['gift.sent','gift.received'].map(action=>listCirclePocketActions(owner,100,action)))).flat().filter(a=>a.ownerId===owner)
  const own=new Map(actions.sort((a,b)=>a.updatedAt-b.updatedAt).filter(a=>a.resourceId).map(a=>[a.resourceId!,a]))
  if(!selected)return [...own].map(([id,a])=>({id,title:(a.action==='gift.received'?'Gift received':'Gift sent')+' · '+text(a.metadata?.amount,40)+' USDC',status:'Select to check saved gift state',updatedAt:a.updatedAt})).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,20)
  if(!own.has(selected))return []
  const {durableGiftStore}=await import('./gifts/store.js')
  const r=await durableGiftStore.read(selected)
  if(!r||!(r.ownerId===owner||(r.state==='claimed'&&r.claim?.userId===owner&&r.claimRecipient?.toLowerCase()===r.claim.walletAddress?.toLowerCase())))return []
  return [{id:r.id,title:'Gift · '+r.amount+' USDC',status:r.state,updatedAt:r.updatedAt,details:[r.deployment.network,'Funding: '+(r.fundingHash?'recorded':'not confirmed'),r.state==='claimed'?'Claim recorded.':r.state==='refunded'?'Refund recorded.':'A claim or refund is not confirmed.',...(Number(r.expiresAt)*1000<=Date.now()&&r.state==='available'?['Expiry has passed. This alone does not confirm a refund.']:[])]}]
 }
 if(kind==='xpay'){
  const {readUnifiedXPayStore}=await import('./unified-xpay-store.js')
  const all=(await readUnifiedXPayStore()).checkouts.filter(r=>r.owner===owner)
  const records=all.filter(r=>!selected||r.id===selected).sort((a,b)=>b.createdAt-a.createdAt)
  if(!selected)return records.slice(0,20).map(r=>({id:r.id,title:text(r.name),status:r.deletedAt?'deleted':r.destinationIds.length?'configured':'setup incomplete',updatedAt:r.createdAt}))
  const r=records[0];if(!r)return []
  const [{listPocketUnifiedXPayPosPayments},{listPocketUnifiedXPayStockPayments}]=await Promise.all([import('../ng-pos.js'),import('./xpay.js')])
  const history=(await Promise.all([listPocketUnifiedXPayPosPayments(owner,r.id,r.legacyDestinationIds),listPocketUnifiedXPayStockPayments(owner,r.id,r.legacyDestinationIds)])).flat().sort((a,b)=>b.createdAt-a.createdAt)
  return [{id:r.id,title:text(r.name),status:r.deletedAt?'deleted':r.destinationIds.length?'configured':'setup incomplete',updatedAt:history[0]?.createdAt||r.createdAt,details:['Latest saved payments for this terminal:',...(history.length?history.slice(0,5).map(payment):['No saved payments found. This does not prove an attempted payment failed.'])]}]
 }
 const [{pocketPaylinkRepository},{listPocketBankCollections}]=await Promise.all([import('./paylink-store.js'),import('../ng-pos.js')])
 const [usdc,bank]=await Promise.all([pocketPaylinkRepository.listOwned(owner),listPocketBankCollections(owner)])
 const records=[...usdc.filter(r=>r.ownerId===owner).map(r=>({...r,kind:'usdc' as const})),...bank]
 if(!selected)return records.sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,20).map(r=>({id:r.kind+':'+r.eventId,title:text(r.title),status:r.deletedAt?'deleted':'active',updatedAt:r.updatedAt}))
 const r=records.find(r=>r.kind+':'+r.eventId===selected);if(!r)return []
 let history:Array<{amount:unknown;asset:unknown;state:unknown;createdAt:number;network?:string}>
 if(r.kind==='usdc'){
  const {listRegisteredPaymentsForEventIds}=await import('../event-registry.js')
  history=(await listRegisteredPaymentsForEventIds([r.eventId])).filter(p=>p.eventId===r.eventId).map(p=>({amount:p.amount,asset:'USDC',state:'confirmed',createdAt:p.ts,network:p.chain}))
 }else{
  const {listPaycrestPosOrdersForMerchants}=await import('../paycrest-pos.js')
  history=(await listPaycrestPosOrdersForMerchants([r.eventId])).filter(p=>p.merchant_id===r.eventId).map(p=>({amount:p.amount_ngn,asset:p.fiat_currency||'NGN',state:p.status,createdAt:Date.parse(p.created_at),network:'base'}))
 }
 history.sort((a,b)=>b.createdAt-a.createdAt)
 return [{id:selected,title:text(r.title),status:r.deletedAt?'deleted':'active',updatedAt:history[0]?.createdAt||r.updatedAt,details:['Latest saved contributions for this collection:',...(history.length?history.slice(0,5).map(payment):['No saved contributions found. This does not prove an attempted payment failed.'])]}]
}
