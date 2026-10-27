import type {CheckoutRecord} from './hosted-checkouts.js'
export type PaymentEvent={event:string;occurredAt:string;details:Record<string,string>}
export type PaymentGroup={recordId:string;product:'checkout'|'funding';createdAt:string;updatedAt:string;events:PaymentEvent[]}
type Funding={checkoutId:string;amount:string;expiresAt:string;observation?:{status:string;paymentStatus:string;bridgeStatus:string;observedAt:string}}
export function paymentStatus(group:PaymentGroup,checkout?:CheckoutRecord,funding?:Funding,now=Date.now()){
 const events=group.events??[],latest=[...events].reverse(),details=latest.find(e=>e.details.amount)?.details??{}
 const has=(names:string[])=>events.some(e=>names.includes(e.event))
 const expiresAt=checkout?.expiresAt??funding?.expiresAt??latest.find(e=>e.details.expiresAt)?.details.expiresAt
 let status='unknown',note='Historical status is unavailable.'
 const attempt=checkout?.paymentAttempts?.at(-1)
 const refunded=checkout?.payout?.status==='refunded'||has(['payout.refunded','funding.refunded'])
 const funded=funding?.observation?.status==='funded'||has(['funding.funded'])
 const paid=checkout?.payment?.status==='paid'&&checkout.payment.referenceType!=='circle_gateway_transfer'
 if(refunded){status='refunded';note='The provider reported a refund.'}
 else if(group.product==='funding'&&funded){status='paid';note='Account funded.'}
 else if(group.product==='checkout'&&(paid||has(['payment.paid'])||checkout?.payout?.status==='delivered')){status='paid';note=checkout?.settlement?(checkout.payout?.status==='delivered'?'Bank payout delivered.':'Payment received; bank payout '+(checkout.payout?.status??'pending')+'.'):'Payment confirmed.'}
 else if(checkout?.payment?.status==='processing'||checkout?.payment?.status==='paid'||attempt?.status==='processing'||attempt?.status==='paid'||(group.product==='funding'&&(funding?.observation?.paymentStatus==='paid'||has(['funding.bridging','payment.paid','checkout.paid'])))) {status='processing';note=group.product==='funding'?'Payment received; account funding is in progress.':'Payment confirmation is in progress.'}
 else if(checkout){
  if(Date.parse(checkout.expiresAt)<=now){status='expired';note='The payment window has closed.'}
  else if(attempt?.status==='failed'&&Boolean(attempt.transaction)||checkout.payment?.status==='failed'&&Boolean(checkout.payment.txHash)){status='failed';note='The last payment attempt was unsuccessful.'}
  else{status='pending';note='Awaiting payment.'}
 }
 else if(has(['funding.expired','checkout.expired'])){status='expired';note='The payment window has closed.'}
 else if(has(['payment.gateway_accepted','checkout.payment_accepted','payment.processing','checkout.processing'])){status='processing';note='Payment submitted; final confirmation is unavailable.'}
 return {recordId:group.recordId,product:group.product,createdAt:group.createdAt,updatedAt:group.updatedAt,status,note,amount:funding?.amount??checkout?.amount??details.amount??'',asset:group.product==='funding'?'USDC':events.find(e=>e.event==='checkout.created')?.details.asset??details.asset??'USDC',expiresAt,
  transactions:[...new Set(events.flatMap(e=>[e.details.txHash,e.details.paymentTransaction,e.details.bridgeTransaction,e.details.transaction].filter(Boolean)))],events}
}
