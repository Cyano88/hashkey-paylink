import {createHash} from 'node:crypto'
import type {Request,Response} from 'express'
import type {DeveloperCheckoutPolicy} from '../developer-projects.js'
import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {readUnifiedXPayStore} from './unified-xpay-store.js'
import {readHostedDestinations,resolveXPayHostedDestination,assertXPayHostedRoute,xpayHostedPartner,parseXPayHostedPartner} from './xpay-hosted-destinations.js'
import {requirePocketBasicKyc} from './kyc-level.js'
import {checkoutStablecoin} from '../../src/lib/checkoutStablecoins.js'
import type {XPayHistoryEntry} from '../../src/pocket/lib/pocketUnifiedXPay.js'
const KEY='pocket:xpay-hosted-attempts:v1'
type Attempt={owner:string;binding:string;at:number;checkoutId?:string;checkoutUrl?:string}
type Store={attempts:Record<string,Attempt>}
export async function prepareXPayHostedPayment(req:Request,owner:string,b:Record<string,unknown>){
 if(typeof b.key!=='string'||!/^[-a-zA-Z0-9_]{16,80}$/.test(b.key)||typeof b.amount!=='string'||! /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/.test(b.amount)||!Number.isFinite(Number(b.amount))||Number(b.amount)<=0)throw Object.assign(Error('Enter a valid payment amount.'),{status:400})
 const c=(await readUnifiedXPayStore()).checkouts.find(c=>c.id===b.id&&!c.deletedAt),destination=await resolveXPayHostedDestination(String(b.id),String(b.destinationId),String(b.network||''))
 if(!c||!destination||destination.terminalId!==c.id||destination.owner!==c.owner||destination.revision!==b.revision)throw Object.assign(Error('Receiving options changed. Reopen the QR.'),{status:409})
 if(c.owner===owner)throw Object.assign(Error('You cannot pay your own QR.'),{status:403})
 const asset=checkoutStablecoin(destination.network,String(b.asset)),partnerId=xpayHostedPartner(c.id,c.version||0,destination.id)
 if(!asset)throw Object.assign(Error('Choose an accepted stablecoin.'),{status:400})
 await assertXPayHostedRoute(partnerId,destination.network,destination.recipient,asset.address)
 await requirePocketBasicKyc(owner)
 const key=createHash('sha256').update(JSON.stringify([owner,c.id,b.key])).digest('hex'),binding=JSON.stringify([partnerId,asset.address,b.amount,...(destination.id.startsWith('pos_')?[destination.network]:[])]),now=Date.now()
 let previous:Attempt|undefined
 await mutateDurableJson<Store>(KEY,current=>{const s=current||{attempts:{}};previous=s.attempts[key];if(previous){if(previous.owner!==owner||previous.binding!==binding)throw Object.assign(Error('This payment attempt already has different details. Reopen the QR to start again.'),{status:409});return s}if(Object.values(s.attempts).filter(a=>a.owner===owner&&a.at>now-86400000).length>=100)throw Object.assign(Error('Too many payment requests. Try again later.'),{status:429});s.attempts[key]={owner,binding,at:now};return s})
 if(previous?.checkoutId&&previous.checkoutUrl)return {ok:true,checkoutId:previous.checkoutId,checkoutUrl:previous.checkoutUrl}
 const config={recipient:destination.recipient,assets:destination.assets.map(a=>checkoutStablecoin(destination.network,a)!.address.toLowerCase())}
 const circle=destination.network!=='xlayer'&&destination.network!=='bsc'
 const policy:DeveloperCheckoutPolicy={partnerId,ownerId:c.owner,merchantName:c.name,allowedOrigins:['https://app.hashpaylink.com'],defaultNetwork:circle?destination.network as DeveloperCheckoutPolicy['defaultNetwork']:'base',paymentOptions:circle?[{network:destination.network as DeveloperCheckoutPolicy['defaultNetwork'],recipient:destination.recipient}]:[],settlementMode:'usdc',environment:'live',checkoutMode:'human',capabilities:['hosted_checkout'],webhookConfigured:false,projectManaged:true,...(destination.network==='bsc'?{bscCheckout:config}:destination.network==='xlayer'?{xlayerCheckout:config}:{acceptedAssets:{[destination.network]:[asset.symbol]}})}
 const options={policy:async()=>policy,enabled:(id:string)=>id===partnerId}
 const handler=circle?(await import('../hosted-checkouts.js')).createHostedCheckoutsHandler({policy:async()=>policy}):destination.network==='bsc'?(await import('../hosted-bsc-checkouts.js')).createHostedBscCheckoutsHandler(options):(await import('../hosted-stock-checkouts.js')).createHostedStockCheckoutsHandler(options)
 let status=200,result:any
 await handler({method:'POST',headers:{'idempotency-key':'xpay:'+key},query:{},body:{...(circle?{kind:'usdc_request'}:{}),amount:b.amount,asset:asset.symbol,title:'QR payment',expiresInMinutes:15,returnUrl:'https://app.hashpaylink.com/xpay/checkout/'+c.id}} as unknown as Request,{setHeader(){},status(code:number){status=code;return this},json(body:unknown){result=body;return this},sendStatus(code:number){status=code;return this}} as unknown as Response)
 if(status>=400||!result?.ok)throw Object.assign(Error(result?.error||'Payment could not be prepared.'),{status:status>=400?status:503})
 if(!/^(?:chk[bx]_[a-f0-9]{24}|chk_[a-zA-Z0-9]{8,40})$/.test(result.checkoutId)||(circle&&!/^[a-zA-Z0-9_-]{1,80}$/.test(result.paymentAttemptId))||result.checkoutUrl!=='/pay/c/'+result.checkoutId+(circle?'?attempt='+result.paymentAttemptId:''))throw Error('Invalid payment preparation result.')
 await mutateDurableJson<Store>(KEY,current=>{if(!current?.attempts[key]||current.attempts[key].binding!==binding)throw Error('Payment attempt changed.');current.attempts[key].checkoutId=result.checkoutId;current.attempts[key].checkoutUrl=result.checkoutUrl;return current})
 return {ok:true,checkoutId:result.checkoutId,checkoutUrl:result.checkoutUrl}
}
export async function readXPayHostedHistory(owner:string,terminalId?:string):Promise<XPayHistoryEntry[]>{
 const circleDestinations=await (await import('../ng-pos.js')).listPocketXPayPosDestinations(owner),terminals=(await readUnifiedXPayStore()).checkouts.filter(c=>c.owner===owner&&(!terminalId||c.id===terminalId));const legacy=(await Promise.all(terminals.flatMap(c=>circleDestinations.filter(d=>d.kind==='stablecoins'&&(c.destinationIds.includes(d.id)||c.pastDestinations?.some(p=>p.id===d.id))).flatMap(d=>(d.networks||[]).map(n=>resolveXPayHostedDestination(c.id,d.id,n)))))).filter((d):d is NonNullable<typeof d>=>!!d)
 const destinations=[...Object.values((await readHostedDestinations()).destinations),...legacy].filter(d=>d.owner===owner&&(!terminalId||d.terminalId===terminalId)),wallets=[...new Set(destinations.map(d=>d.recipient))]
 if(!wallets.length)return []
 const circle=await (await import('../hosted-checkouts.js')).readPaidHostedCheckoutActivity(wallets)
 const circleHistory:XPayHistoryEntry[]=circle.filter(r=>{const p=parseXPayHostedPartner(r.partnerId);return !!p&&destinations.some(d=>d.id===p.destinationId&&d.terminalId===p.terminalId)}).map(r=>({merchantName:r.merchantName,id:r.payment!.txHash,rail:'stablecoins',amount:r.payment!.fees?.netAmount||r.amount,asset:r.asset||'USDC',state:'successful',createdAt:Date.parse(r.payment!.confirmedAt),hash:r.payment!.txHash,network:r.payment!.network||r.network}))
 const [bsc,xlayer]=await Promise.all([(await import('../hosted-bsc-checkouts.js')).readPaidBscCheckoutActivity(wallets),(await import('../hosted-stock-checkouts.js')).readPaidStockCheckoutActivity(wallets)])
 return [...bsc,...xlayer].filter(r=>{const p=parseXPayHostedPartner(r.partnerId);return r.ownerId===owner&&!!p&&(!terminalId||p.terminalId===terminalId)&&destinations.some(d=>d.id===p.destinationId&&d.terminalId===p.terminalId)}).map<XPayHistoryEntry>(r=>({merchantName:r.merchantName,id:r.payment!.receiptId,rail:'stablecoins',amount:r.payment!.fees?.netAmount||r.amount,asset:r.asset,state:'successful',createdAt:Date.parse(r.payment!.confirmedAt),hash:r.payment!.txHash,network:r.network})).concat(circleHistory)
}
