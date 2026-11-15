import {ALLOWANCE_DAY_POLICY,allowanceDay,currentAllowanceCharge,nextAllowanceReset} from '../../src/lib/allowanceDay.js'
import {createHash} from 'node:crypto'
import {mutateDurableJson,readDurableJson} from '../render-durable-store.js'
import {readPocketKycLevel,type PocketKycLevel} from './kyc-level.js'
import {PERSONAL_BANK_DAILY_USD} from '../../src/lib/purchaseLimits.js'
export const BASIC_BANK_DAILY_USD=PERSONAL_BANK_DAILY_USD.basic
export const ADVANCED_BANK_DAILY_USD=PERSONAL_BANK_DAILY_USD.advanced
type Charge={dayPolicy?:string;usdUnits?:number;id:string;day:string;amount:number;state:'reserved'|'released';createdAt:number;binding?:string;providerOrderId?:string}
type Ledger={charges:Charge[]}
const key=(owner:string)=>'hashpaylink:pocket-transfer-allowance:v1:'+createHash('sha256').update(owner).digest('hex')
export const utcAllowanceDay=allowanceDay
const failure=(code:string,message:string,details={})=>Object.assign(Error(message),{status:403,code,...details})
const cap=(level:PocketKycLevel)=>level==='none'?0:PERSONAL_BANK_DAILY_USD[level]
function usdUnits(value:string|undefined){
 if(!value||!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value))throw failure('KYC_LIMIT_UNAVAILABLE','Refresh the transfer quote to check your allowance.')
 const [whole,fraction='']=value.split('.'),n=Number(BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0')))
 if(!Number.isSafeInteger(n)||n<=0)throw failure('KYC_LIMIT_UNAVAILABLE','Invalid transfer amount.')
 return n
}
function activeUsage(ledger:Ledger|undefined,now:number){
 const active=(ledger?.charges||[]).filter(c=>currentAllowanceCharge(c,now)&&c.state==='reserved')
 if(active.some(c=>!Number.isSafeInteger(c.usdUnits)||!c.usdUnits))throw failure('KYC_LIMIT_UNAVAILABLE','Your previous transfers are being reconciled. Try again.')
 return active.reduce((sum,c)=>sum+c.usdUnits!,0)
}
export function reserveAllowance(ledger:Ledger|undefined,input:{id:string;amount:number;usdUnits:number;level:PocketKycLevel;now:number;binding?:string;providerOrderId?:string}) {
 if(input.level==='none')throw failure('KYC_BASIC_REQUIRED','Complete Basic verification to use bank transfers.')
 if(!Number.isSafeInteger(input.amount)||input.amount<=0||!Number.isSafeInteger(input.usdUnits)||input.usdUnits<=0)throw failure('KYC_LIMIT_UNAVAILABLE','The transfer allowance could not be checked. Try again.')
 const day=utcAllowanceDay(input.now),current=ledger||{charges:[]},previous=current.charges.find(c=>c.id===input.id)
 if(previous&&(previous.amount!==input.amount||previous.binding!==input.binding||previous.usdUnits!==input.usdUnits))throw failure('KYC_LIMIT_BINDING','This transfer quote changed. Start a new payment.')
 if(previous?.state==='reserved'&&currentAllowanceCharge(previous,input.now))return {charges:current.charges.map(c=>c.id===input.id?{...c,providerOrderId:input.providerOrderId||c.providerOrderId}:c)}
 const used=activeUsage(current,input.now),limit=cap(input.level)*1000000
 if(used+input.usdUnits>limit)throw failure(input.level==='basic'?'KYC_ADVANCED_REQUIRED':'KYC_DAILY_LIMIT','Your remaining personal bank-transfer allowance is USD '+(Math.max(0,limit-used)/1000000).toLocaleString('en-US',{maximumFractionDigits:2})+'. It resets at 00:00 UTC.',{dailyLimitUsd:cap(input.level),remainingUsd:Math.max(0,limit-used)/1000000})
 const charge:Charge={id:input.id,day,dayPolicy:ALLOWANCE_DAY_POLICY,amount:input.amount,usdUnits:input.usdUnits,state:'reserved',createdAt:input.now,binding:input.binding,providerOrderId:input.providerOrderId}
 return {charges:[...current.charges.filter(c=>c.id!==input.id),charge]}
}
async function refreshReleases(owner:string) {
 const ledger=await readDurableJson<Ledger>(key(owner));if(!ledger)return
 const {getDurablePaycrestPosOrders}=await import('../paycrest-pos.js')
 const candidates=ledger.charges.filter(c=>c.state==='reserved'&&currentAllowanceCharge(c,Date.now()))
 const orders=new Map((await getDurablePaycrestPosOrders(candidates.map(c=>c.id))).map(o=>[o.intent_id,o]))
 const release:Charge[]=[],valuations=new Map<string,number>()
 for(const charge of candidates){const order=orders.get(charge.id);if(!order)continue
  const status=order.status.toLowerCase()
  // Never release ambiguous/submitted failures. A refund is provider-confirmed.
  if(charge.providerOrderId&&order.paycrest_order_id!==charge.providerOrderId)continue
  if(!charge.usdUnits&&order.amount_usdc){try{valuations.set(charge.id,usdUnits(order.amount_usdc))}catch{}}
  if(status==='refunded'||!order.tx_hash&&['failed','cancelled','canceled'].includes(status))release.push(charge)
 }
 if(release.length||valuations.size)await mutateDurableJson<Ledger>(key(owner),r=>({charges:(r?.charges||[]).map(c=>release.some(old=>old.id===c.id&&old.createdAt===c.createdAt&&old.providerOrderId===c.providerOrderId)?{...c,state:'released' as const}:valuations.has(c.id)&&c.createdAt===candidates.find(old=>old.id===c.id)?.createdAt&&c.providerOrderId===candidates.find(old=>old.id===c.id)?.providerOrderId?{...c,usdUnits:c.usdUnits??valuations.get(c.id)}:c)}))
}
export async function pocketTransferAllowance(owner:string) {
 const verification=await readPocketKycLevel(owner),level=verification.paymentLevel||verification.level
 await refreshReleases(owner)
 const ledger=await readDurableJson<Ledger>(key(owner)),now=Date.now(),dailyLimitUsd=cap(level),usedUsd=activeUsage(ledger,now)/1000000
 return {level:verification.level,country:verification.country,paymentLevel:level,limitCurrency:'USD' as const,dailyLimitUsd,usedUsd,remainingUsd:Math.max(0,dailyLimitUsd-usedUsd),basicDailyLimitUsd:BASIC_BANK_DAILY_USD,advancedDailyLimitUsd:ADVANCED_BANK_DAILY_USD,resetsAt:new Date(nextAllowanceReset(now)).toISOString()}
}
export async function reservePocketBankAllowance(owner:string,input:{id:string;amount:string;currency:string;usdc?:string;token?:'USDC'|'USDT';providerOrderId?:string},checkOnly=false) {
 const verification=await readPocketKycLevel(owner),level=verification.paymentLevel||verification.level
 if(level==='none')throw failure('KYC_BASIC_REQUIRED','Complete Basic verification to use bank transfers.')
 await refreshReleases(owner)
 const existing=(await readDurableJson<Ledger>(key(owner)))?.charges.find(c=>c.id===input.id&&c.state==='reserved'),binding=JSON.stringify([input.currency,input.amount])
 if(existing){if(existing.binding!==binding)throw failure('KYC_LIMIT_BINDING','This transfer amount changed. Start a new payment.');if(!currentAllowanceCharge(existing,Date.now())){const {getPaycrestPosOrder}=await import('../paycrest-pos.js');const order=await getPaycrestPosOrder(input.id);if(order?.tx_hash)return}}
 if(!['NGN','UGX'].includes(input.currency)||!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(input.amount))throw failure('KYC_LIMIT_UNAVAILABLE','Enter a valid payout amount.')
 const parts=input.amount.split('.'),amount=existing?.amount??Number(BigInt(parts[0])*100n+BigInt((parts[1]||'').padEnd(2,'0'))),dollarUnits=usdUnits(input.usdc)
 if(checkOnly){const {readPocketBankPayoutLimit}=await import('./spending-limits.js');const capacity=await readPocketBankPayoutLimit(input.currency==='UGX'?'UGX':'NGN');if(dollarUnits>Math.floor(capacity.maxUsdc*1000000))throw failure('KYC_TRANSFER_CAPACITY','This transfer exceeds current bank payout capacity. Choose a lower amount.')}
 const next=(r:Ledger|undefined)=>reserveAllowance(r,{id:input.id,amount,usdUnits:dollarUnits,level,now:Date.now(),binding,providerOrderId:input.providerOrderId})
 if(checkOnly){next(await readDurableJson<Ledger>(key(owner)));return}
 await mutateDurableJson<Ledger>(key(owner),next)
}
