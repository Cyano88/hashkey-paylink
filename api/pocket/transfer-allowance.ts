import {createHash} from 'node:crypto'
import {mutateDurableJson,readDurableJson} from '../render-durable-store.js'
import {advancedDailyNgn,BASIC_DAILY_NGN,readPocketKycLevel,type PocketKycLevel} from './kyc-level.js'
type Charge={id:string;day:string;amount:number;state:'reserved'|'released';createdAt:number;binding?:string;providerOrderId?:string}
type Ledger={charges:Charge[]}
const key=(owner:string)=>'hashpaylink:pocket-transfer-allowance:v1:'+createHash('sha256').update(owner).digest('hex')
export const nigeriaDay=(now:number)=>new Date(now+3600000).toISOString().slice(0,10)
const failure=(code:string,message:string,details={})=>Object.assign(Error(message),{status:403,code,...details})
const cap=(level:PocketKycLevel)=>level==='none'?0:level==='advanced'?(advancedDailyNgn()??BASIC_DAILY_NGN):BASIC_DAILY_NGN
export function reserveAllowance(ledger:Ledger|undefined,input:{id:string;amount:number;level:PocketKycLevel;now:number;binding?:string;providerOrderId?:string}) {
 if(input.level==='none')throw failure('KYC_BASIC_REQUIRED','Complete Basic verification to use bank transfers.')
 if(!Number.isSafeInteger(input.amount)||input.amount<=0)throw failure('KYC_LIMIT_UNAVAILABLE','The transfer allowance could not be checked. Try again.')
 const day=nigeriaDay(input.now),current=ledger||{charges:[]},previous=current.charges.find(c=>c.id===input.id)
 if(previous&&(previous.amount!==input.amount||previous.binding!==input.binding))throw failure('KYC_LIMIT_BINDING','This payment amount has changed. Start a new payment.')
 if(previous?.state==='reserved'&&previous.day===day)return {charges:current.charges.map(c=>c.id===input.id?{...c,providerOrderId:input.providerOrderId||c.providerOrderId}:c)}
 const used=current.charges.filter(c=>c.day===day&&c.state==='reserved').reduce((s,c)=>s+c.amount,0),limit=cap(input.level)*100
 if(used+input.amount>limit)throw failure(input.level==='basic'?'KYC_ADVANCED_REQUIRED':'KYC_DAILY_LIMIT','Your daily bank-transfer allowance cannot cover this payment.',{remainingNgn:Math.max(0,limit-used)/100,dailyLimitNgn:limit/100})
 const charge:Charge={id:input.id,day,amount:input.amount,state:'reserved',createdAt:input.now,binding:input.binding,providerOrderId:input.providerOrderId}
 return {charges:[...current.charges.filter(c=>c.id!==input.id),charge]}
}
async function refreshReleases(owner:string) {
 const ledger=await readDurableJson<Ledger>(key(owner));if(!ledger)return
 const {getDurablePaycrestPosOrders}=await import('../paycrest-pos.js')
 const candidates=ledger.charges.filter(c=>c.state==='reserved'&&c.day===nigeriaDay(Date.now()))
 const orders=new Map((await getDurablePaycrestPosOrders(candidates.map(c=>c.id))).map(o=>[o.intent_id,o]))
 const release:Charge[]=[]
 for(const charge of candidates){const order=orders.get(charge.id);if(!order)continue
  const status=order.status.toLowerCase()
  // Never release ambiguous/submitted failures. A refund is provider-confirmed.
  if(charge.providerOrderId&&order.paycrest_order_id!==charge.providerOrderId)continue
  if(status==='refunded'||!order.tx_hash&&['failed','cancelled','canceled'].includes(status))release.push(charge)
 }
 if(release.length)await mutateDurableJson<Ledger>(key(owner),r=>({charges:(r?.charges||[]).map(c=>release.some(old=>old.id===c.id&&old.createdAt===c.createdAt&&old.providerOrderId===c.providerOrderId)?{...c,state:'released' as const}:c)}))
}
export async function pocketTransferAllowance(owner:string) {
 const verification=await readPocketKycLevel(owner),level=verification.paymentLevel||verification.level;await refreshReleases(owner)
 const ledger=await readDurableJson<Ledger>(key(owner)),day=nigeriaDay(Date.now()),limit=cap(level)
 const used=(ledger?.charges||[]).filter(c=>c.day===day&&c.state==='reserved').reduce((n,c)=>n+c.amount,0)/100
 return {level:verification.level,country:verification.country,paymentLevel:level,dailyLimitNgn:limit,remainingNgn:Math.max(0,limit-used),advancedDailyLimitNgn:advancedDailyNgn(),resetsAt:new Date(Date.parse(day+'T00:00:00Z')+86400000-3600000).toISOString()}
}
export async function reservePocketBankAllowance(owner:string,input:{id:string;amount:string;currency:string;usdc?:string;token?:'USDC'|'USDT';providerOrderId?:string},checkOnly=false) {
 const verification=await readPocketKycLevel(owner),level=verification.paymentLevel||verification.level
 if(level==='none')throw failure('KYC_BASIC_REQUIRED','Complete Basic verification to use bank transfers.')
 await refreshReleases(owner)
 const existing=(await readDurableJson<Ledger>(key(owner)))?.charges.find(c=>c.id===input.id&&c.state==='reserved')
 const binding=JSON.stringify([input.currency,input.amount])
 if(existing){if(existing.binding!==binding)throw failure('KYC_LIMIT_BINDING','This payment amount has changed. Start a new payment.');if(existing.day!==nigeriaDay(Date.now())){const {getPaycrestPosOrder}=await import('../paycrest-pos.js');const order=await getPaycrestPosOrder(input.id);if(order?.tx_hash)return}}
 if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(input.amount))throw failure('KYC_LIMIT_UNAVAILABLE','Enter a valid payout amount.')
 let ngn=Number(input.amount)
 if(input.currency!=='NGN'&&!existing){
  if(input.currency!=='UGX'||!input.usdc||!Number.isFinite(Number(input.usdc))||Number(input.usdc)<=0)throw failure('KYC_LIMIT_UNAVAILABLE','The transfer allowance could not be checked. Try again.')
  const {getPaycrestOfframpRate}=await import('../paycrest-pos.js')
  ngn=Number(input.usdc)*await getPaycrestOfframpRate({network:'base',token:input.token||'USDC',fiat:'NGN',amount:input.usdc})
 }
 // Preserve the original FX equivalent across retries.
 const parts=input.amount.split('.')
 const amount=existing?.amount??(input.currency==='NGN'?Number(BigInt(parts[0])*100n+BigInt((parts[1]||'').padEnd(2,'0'))):Math.ceil(ngn*100))
 const next=(r:Ledger|undefined)=>reserveAllowance(r,{id:input.id,amount,level,now:Date.now(),binding,providerOrderId:input.providerOrderId})
 if(checkOnly){next(await readDurableJson<Ledger>(key(owner)));return}
 await mutateDurableJson<Ledger>(key(owner),next)
}
