import {randomUUID} from 'node:crypto'
import {mutateDurableJson,readDurableJson} from '../render-durable-store.js'
import type {XPayPayoutQuote} from './xpay-bank-payout.js'
import type {StockSwapQuote} from '../../src/pocket/lib/pocketXStocksSwap.js'
export type XPayBankState='quoted'|'approved'|'swap_authorized'|'swap_submitted'|'swap_confirmed'|'bridging'|'payout_ready'|'payout_requested'|'payout_submitted'|'successful'|'failed'|'refunded'
export type XPayBankPayment={id:string;key:string;owner:string;checkoutId:string;merchantId:string;source:string;token:string;symbol:string;amount:string;amountUnits:string;fiatAmount:string;state:XPayBankState;payout:XPayPayoutQuote;replacementPayout?:XPayPayoutQuote;previousPayouts?:XPayPayoutQuote[];bridgeId:string;bridgeUnits:string;swap?:StockSwapQuote;swapHash?:string;swapStartBlock?:string;swapScanBlock?:string;receivedUnits?:string;approvedAt?:number;failureStage?:'swap'|'bridge'|'payment';failureState?:XPayBankState;error?:string;payoutKey?:string;challengeId?:string;payoutHash?:string;burnHash?:string;burnVerified?:boolean;mintHash?:string;bankDelivery?:string;createdAt:number;updatedAt:number}
type Store={payments:XPayBankPayment[]}
const key=(owner:string)=>'pocket:xpay:bank-payments:v1:'+owner
function fail(message:string):never {throw Object.assign(new Error(message),{status:409})}
const inactive=(r:XPayBankPayment)=>['quoted','successful','refunded'].includes(r.state)
const defaults={read:readDurableJson<Store>,mutate:mutateDurableJson<Store>,now:Date.now,id:randomUUID}
export function createXPayBankStore(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 async function change(owner:string,id:string,fn:(r:XPayBankPayment,s:Store)=>void){let saved:XPayBankPayment|undefined;await d.mutate(key(owner),current=>{const s=current||{payments:[]},r=s.payments.find(p=>p.owner===owner&&p.id===id);if(!r)fail('Payment not found.');fn(r,s);r.updatedAt=d.now();saved=structuredClone(r);return s});return saved!}
 return {
  async find(owner:string,id:string){return (await d.read(key(owner)))?.payments.find(p=>p.owner===owner&&p.id===id)},
  async byKey(owner:string,requestKey:string){return (await d.read(key(owner)))?.payments.find(p=>p.owner===owner&&p.key===requestKey)},
  async list(owner:string){return (await d.read(key(owner)))?.payments.filter(p=>p.owner===owner)||[]},
  async create(input:Omit<XPayBankPayment,'id'|'createdAt'|'updatedAt'|'state'>){let saved:XPayBankPayment|undefined;await d.mutate(key(input.owner),current=>{const s=current||{payments:[]};const existing=s.payments.find(p=>p.key===input.key);if(existing){if(existing.checkoutId!==input.checkoutId||existing.merchantId!==input.merchantId||existing.source!==input.source||existing.token!==input.token||existing.fiatAmount!==input.fiatAmount)fail('Payment reference already has different details.');saved=existing;return s}saved={...input,id:d.id(),state:'quoted',createdAt:d.now(),updatedAt:d.now()};s.payments.push(saved);return s});return saved!},
  approve:(owner:string,id:string)=>change(owner,id,(r,s)=>{if(r.state!=='quoted')fail('This payment already started. Check its status.');if(s.payments.some(p=>p.id!==id&&!inactive(p)))fail('An earlier XPay payment is awaiting confirmation.');if(r.payout.expiresAt<=d.now()+90000||r.swap&&r.swap.expiresAt<=d.now())fail('The quote expired. Review an updated quote.');r.approvedAt=d.now();r.state='approved'}),
  startSwap:(owner:string,id:string,quote:StockSwapQuote,block:string)=>change(owner,id,r=>{if(r.state!=='approved'||!r.swap)fail('This stock conversion is already submitted or not approved.');if(!/^\d+$/.test(block))fail('Invalid source block.');if(quote.owner.toLowerCase()!==r.source.toLowerCase()||quote.tokenIn.address.toLowerCase()!==r.token.toLowerCase()||quote.amountUnits!==r.amountUnits||quote.tokenOut.address.toLowerCase()!==r.swap.tokenOut.address.toLowerCase()||quote.decimalsIn!==r.swap.decimalsIn||quote.decimalsOut!==r.swap.decimalsOut||quote.expiresAt<=d.now()||quote.chainId!==196||JSON.stringify(quote.positiveSlippageFee)!==JSON.stringify(r.swap.positiveSlippageFee)||!(Number(quote.gasFee)>0)||Number(quote.gasFee)>Number(r.swap.gasFee)*1.2||BigInt(quote.minimumOutUnits)<BigInt(r.bridgeUnits)||BigInt(quote.minimumOutUnits)<BigInt(r.swap.minimumOutUnits))fail('Stock quote changed. Review before paying.');r.swap=quote;r.swapStartBlock=block;r.swapScanBlock=block;r.state='swap_authorized'}),
  swapSubmitted:(owner:string,id:string,hash:string)=>change(owner,id,r=>{if(!/^0x[0-9a-f]{64}$/i.test(hash))fail('Invalid stock transaction.');if(r.swapHash){if(r.swapHash.toLowerCase()!==hash.toLowerCase())fail('Stock transaction cannot change.');return}if(r.state!=='swap_authorized')fail('Authorize this stock conversion first.');r.swapHash=hash.toLowerCase();r.state='swap_submitted'}),
  scanSwap:(owner:string,id:string,end:string)=>change(owner,id,r=>{if(r.state==='swap_authorized'&&!r.swapHash&&/^\d+$/.test(end)&&BigInt(end)>=BigInt(r.swapScanBlock||'0'))r.swapScanBlock=end}),
  swapConfirmed:(owner:string,id:string,received:string)=>change(owner,id,r=>{if(r.state!=='swap_submitted'||!r.swapHash||BigInt(received)<BigInt(r.bridgeUnits))fail('Stock conversion has not been verified.');r.receivedUnits=received;r.state='swap_confirmed'}),
  startBridge:(owner:string,id:string)=>change(owner,id,r=>{if(r.state==='bridging')return;if(r.swap?r.state!=='swap_confirmed':r.state!=='approved')fail('Verify funding before bridging.');r.state='bridging'}),
  bridgeConfirmed:(owner:string,id:string)=>change(owner,id,r=>{if(r.state==='payout_ready')return;if(r.state!=='bridging')fail('Bridge arrival has not been verified.');r.state='payout_ready'}),
  offerPayout:(owner:string,id:string,quote:XPayPayoutQuote)=>change(owner,id,r=>{
   if(!['approved','swap_confirmed','bridging','payout_ready'].includes(r.state)||r.payoutKey||r.challengeId)fail('Check the submitted payment before changing its quote.')
   if(quote.merchantId!==r.merchantId||quote.wallet.toLowerCase()!==r.payout.wallet.toLowerCase()||quote.walletId!==r.payout.walletId||quote.currency!==r.payout.currency||quote.fiatAmount!==r.fiatAmount||BigInt(quote.fundingUnits)>BigInt(r.payout.fundingUnits)||quote.expiresAt<=d.now()+90000)fail('The updated quote needs more funds or changed the receiving details. Your converted funds remain in your wallet.')
   r.replacementPayout=quote
  }),
  acceptPayout:(owner:string,id:string,intentId:string)=>change(owner,id,r=>{
   const quote=r.replacementPayout
   if(!quote||quote.intentId!==intentId||quote.expiresAt<=d.now()+90000||!['approved','swap_confirmed','bridging','payout_ready'].includes(r.state)||r.payoutKey||r.challengeId)fail('Review the current bank quote before continuing.')
   r.previousPayouts=[...(r.previousPayouts||[]),r.payout];r.payout=quote;r.replacementPayout=undefined
  }),
  claimPayout:(owner:string,id:string)=>change(owner,id,r=>{if(['payout_requested','payout_submitted'].includes(r.state))return;if(r.state!=='payout_ready')fail('Base funding has not arrived.');if(r.replacementPayout)fail('Confirm the updated quote before paying.');r.payoutKey=d.id();r.state='payout_requested'}),
  payoutChallenge:(owner:string,id:string,requestKey:string,challengeId:string)=>change(owner,id,r=>{if(!['payout_requested','payout_submitted'].includes(r.state)||r.payoutKey!==requestKey)fail('Payment approval changed.');if(r.challengeId&&r.challengeId!==challengeId)fail('Payment challenge cannot change.');r.challengeId=challengeId;r.state='payout_submitted'}),
  bridgeEvidence:(owner:string,id:string,bridgeId:string,burnHash?:string,mintHash?:string,burnVerified=false)=>change(owner,id,r=>{
   if(r.bridgeId!==bridgeId)fail('Bridge recovery changed.');if(burnVerified)r.burnVerified=true
   for(const [field,value] of [['burnHash',burnHash],['mintHash',mintHash]] as const){if(!value)continue;if(!/^0x[0-9a-f]{64}$/i.test(value))fail('Invalid bridge evidence.');if(r[field]&&r[field]!==value.toLowerCase())fail('Bridge evidence cannot change.');r[field]=value.toLowerCase()}
  }),
  delivery:(owner:string,id:string,hash:string,status:string)=>change(owner,id,r=>{
   if(!['successful','refunded'].includes(r.state)||r.payoutHash!==hash.toLowerCase())fail('Verify bank funding before delivery updates.')
   if(r.state==='refunded'&&status!=='refunded')return
   r.bankDelivery=status;if(status==='refunded')r.state='refunded'
  }),
  payoutBroadcast:(owner:string,id:string,requestKey:string,hash:string)=>change(owner,id,r=>{
   if(r.state!=='payout_submitted'||r.payoutKey!==requestKey||!/^0x[0-9a-f]{64}$/i.test(hash))fail('Payment broadcast does not match the current approval.')
   if(r.payoutHash&&r.payoutHash!==hash.toLowerCase())fail('Payment transaction cannot change.')
   r.payoutHash=hash.toLowerCase()
  }),
  complete:(owner:string,id:string,hash:string)=>change(owner,id,r=>{if(!/^0x[0-9a-f]{64}$/i.test(hash))fail('Invalid payment transaction.');if(r.state==='successful'){if(r.payoutHash!==hash.toLowerCase())fail('Payment receipt cannot change.');return}if(r.state!=='payout_submitted')fail('Payment confirmation is not ready.');if(r.payoutHash&&r.payoutHash!==hash.toLowerCase())fail('Payment transaction cannot change.');r.payoutHash=hash.toLowerCase();r.state='successful'}),
  // A timeout or unknown broadcast outcome must never call this method.
  // Only verified reverted transactions / terminal failed Circle challenges qualify.
  verifiedFailure:(owner:string,id:string,stage:'swap'|'bridge'|'payment',reference:string,message:string)=>change(owner,id,r=>{
   const expected=stage==='swap'?r.swapHash:stage==='payment'?r.challengeId:r.bridgeId
   const allowed=stage==='swap'?r.state==='swap_submitted':stage==='payment'?r.state==='payout_submitted':r.state==='bridging'
   if(!allowed||!reference||reference!==expected||stage==='payment'&&r.payoutHash)fail('This failure has not been verified against the active submission.')
   r.failureState=r.state;r.failureStage=stage;r.error=message;r.state='failed'
  }),
  // Retry receives a server-validated replacement; it cannot erase completed stages.
  retryPayment:(owner:string,id:string)=>change(owner,id,r=>{
   if(r.state!=='failed'||r.failureStage!=='payment'||r.failureState!=='payout_submitted')fail('Check the existing payment before retrying.')
   r.state='payout_ready';r.payoutKey=undefined;r.challengeId=undefined;r.failureStage=undefined;r.error=undefined
  }),
  retryBridge:(owner:string,id:string,bridgeId:string)=>change(owner,id,r=>{
   if(r.state!=='failed'||r.failureStage!=='bridge'||r.failureState!=='bridging'||!bridgeId)fail('Check the existing bridge before retrying.')
   r.bridgeId=bridgeId;r.burnHash=undefined;r.burnVerified=false;r.mintHash=undefined;r.state='bridging';r.failureStage=undefined;r.error=undefined
  }),
  retrySwap:(owner:string,id:string)=>change(owner,id,r=>{
   if(r.state!=='failed'||r.failureStage!=='swap'||r.failureState!=='swap_submitted')fail('Check the existing stock conversion before retrying.')
   r.state='approved';r.swapHash=undefined;r.swapStartBlock=undefined;r.swapScanBlock=undefined;r.failureStage=undefined;r.error=undefined
  }),
 }
}

export function verifiedXPayConversionHashes(r:XPayBankPayment){
 return [r.receivedUnits?r.swapHash:undefined,r.burnVerified?r.burnHash:undefined,r.mintHash,['successful','refunded'].includes(r.state)?r.payoutHash:undefined].filter((h):h is string=>Boolean(h))
}
export async function readXPayConversionHashes(owner:string){return new Set((await createXPayBankStore().list(owner)).flatMap(verifiedXPayConversionHashes).map(h=>h.toLowerCase()))}
