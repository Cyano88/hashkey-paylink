import {requiresNgnPricing} from './checkout-pricing.js'
import {getPaycrestOfframpRate} from './paycrest-pos.js'
import {resolveDeveloperApiKeyPolicy} from './developer-projects.js'
import type {XPayDestination} from '../src/pocket/lib/pocketUnifiedXPay.js'
import type {Request,Response} from 'express'
import {createHash,randomUUID} from 'node:crypto'
import {formatUnits,parseUnits} from 'viem'
import {foodBasket,foodMenu,type FoodAsset} from '../src/lib/foodDemo.js'
import {hasRenderDurableStore,readDurableJson,mutateDurableJson} from './render-durable-store.js'
import {readStockMarketPrices} from './pocket/xstocks-prices.js'
import {stockAssets,stockUsdc} from '../src/pocket/lib/pocketXStocksWallet.js'
import {acceptedCheckoutAssets} from '../src/lib/checkoutAcceptance.js'
import {checkoutStablecoins} from '../src/lib/checkoutStablecoins.js'
const STORE='hashpaylink:food-demo-orders:v1'
type MenuQuote={id:string;expiresAt:number;prices:Record<string,number>}
type Order={orderPrice?:{currency:'NGN';amount:string};receiptId?:string;id:string;fingerprint:string;lines:ReturnType<typeof foodBasket>['lines'];cents:number;asset:FoodAsset;hosted?:boolean;rail?:'circle'|'xlayer'|'bsc';network?:string;selectedNetwork?:string;amount:string;payableAmount?:string;settlementMode?:'usdc'|'ngn'|'ugx';createdAt:number;checkoutId?:string;checkoutUrl?:string;paid?:boolean}
type Draft={id:string;lines:ReturnType<typeof foodBasket>['lines'];cents:number;createdAt:number}
type Store={menuQuote?:MenuQuote;orders:Record<string,Order>;drafts?:Record<string,Draft>}
async function projectChoices():Promise<XPayDestination[]>{
 const policy=await resolveDeveloperApiKeyPolicy({headers:{'x-api-key':process.env.FOOD_DEMO_PROJECT_KEY||''},method:'POST',originalUrl:'/api/v2/checkouts',body:{}})
 if(!policy||policy.environment!=='live'||policy.checkoutMode!=='human'||!policy.capabilities.includes('hosted_checkout'))throw Error('Checkout is not configured for this store.')
 if(policy.settlementMode==='ngn'||policy.settlementMode==='ugx')return [{id:'circle',name:policy.merchantName,kind:'bank',currency:policy.settlementMode==='ngn'?'NGN':'UGX',assets:['USDC'],networks:['base'],revision:'1'}]
 const choices:XPayDestination[]=[]
 const networks=policy.paymentOptions.map(p=>p.network)
 if(networks.length)choices.push({id:'circle',name:policy.merchantName,kind:'stablecoins',currency:'USD',assets:[...new Set(networks.flatMap(n=>acceptedCheckoutAssets(n,policy.acceptedAssets)))],networks,revision:'1'})
 const assets=checkoutStablecoins('xlayer').filter(a=>policy.xlayerCheckout?.assets.includes(a.address.toLowerCase())).map(a=>a.symbol)
 if(assets.length&&process.env.HASHPAYLINK_XSTOCKS_CHECKOUT_ENABLED==='true'&&(process.env.HASHPAYLINK_XSTOCKS_CHECKOUT_PROJECTS||'').split(',').map(s=>s.trim()).includes(policy.partnerId))choices.push({id:'xlayer',name:policy.merchantName,kind:'xstocks',currency:'USD',assets,networks:['xlayer'],revision:'1'})
 return choices
}
const defaults={ngnPricing:async()=>{const p=await resolveDeveloperApiKeyPolicy({headers:{'x-api-key':process.env.FOOD_DEMO_PROJECT_KEY||''},method:'POST',originalUrl:'/api/v2/checkouts',body:{}});return !!p&&requiresNgnPricing(p)},rate:()=>getPaycrestOfframpRate({network:'base',token:'USDC',fiat:'NGN',amount:'1'}),selectionEnabled:async()=>{const p=await resolveDeveloperApiKeyPolicy({headers:{'x-api-key':process.env.FOOD_DEMO_PROJECT_KEY||''},method:'POST',originalUrl:'/api/v2/checkouts',body:{}});return p?.settlementMode==='usdc'||p?.settlementMode==='ngn'},choices:projectChoices,read:async()=>await readDurableJson<Store>(STORE)||{orders:{}},mutate:(fn:(s:Store)=>Store)=>mutateDurableJson<Store>(STORE,s=>fn(s||{orders:{}})),ready:()=>hasRenderDurableStore()&&process.env.FOOD_DEMO_ENABLED==='true'&&!!process.env.FOOD_DEMO_PROJECT_KEY,now:Date.now,price:async(address:string)=>(await readStockMarketPrices([address.toLowerCase()]))[address.toLowerCase()]?.usd,call:async(path:string,body?:unknown,key?:string)=>{
 const response=await fetch('https://app.hashpaylink.com/api/v2/checkouts'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-API-Key':process.env.FOOD_DEMO_PROJECT_KEY||'',...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000),redirect:'error'});
 const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw Error('Payment is unavailable. Your order has not been charged.');return data
}}
async function refreshFoodOrder(d:typeof defaults,order:Order){
 if(order.paid&&order.receiptId)return 'paid'
 if(!order.checkoutId)return 'pending'
 const status=await d.call('?id='+encodeURIComponent(order.checkoutId)+'&purpose=status').catch(error=>{if(order.paid)return null;throw error})
 if(!status)return 'paid'
 const matches=order.rail==='circle'?status.checkoutId===order.checkoutId:status.checkout?.id===order.checkoutId
 if(!matches){if(order.paid)return 'paid';throw Error('Payment status could not be verified. Please check again.')}
 const pricing=status.pricing||status.checkout?.pricing
 const priceMatches=!order.orderPrice||(pricing?.currency===order.orderPrice.currency&&pricing?.amount===order.orderPrice.amount)
 const expectedSettlement=order.checkoutId.startsWith('chks_')&&status.settlementByMethod?(status.paymentMethod==='cash_balance'?'ngn':'usdc'):(order.settlementMode||'usdc')
 const paidAmount=String(status.payment?.amount||status.checkout?.amount||'')
 const amountMatches=order.orderPrice?priceMatches&&pricing.paymentAsset===(status.asset||status.checkout?.asset)&&/^\d+(?:\.\d{1,18})?$/.test(paidAmount)&&parseUnits(paidAmount,18)===parseUnits(expectedSettlement==='usdc'?pricing.paymentAmount:(order.checkoutId.startsWith('chks_')?status.amount:order.payableAmount)||'0',18):status.payment?.amount===(order.checkoutId.startsWith('chks_')&&order.settlementMode!=='usdc'?status.amount:order.payableAmount||order.amount)
 if(status.status==='paid'&&priceMatches&&(!order.checkoutId.startsWith('chks_')||['USDC','USDT','USDe','USDG'].includes(status.asset))&&(order.rail==='circle'?status.settlementMode===expectedSettlement&&amountMatches:status.checkout.asset===order.asset&&status.checkout.amount===order.amount)){
  if(order.checkoutId.startsWith('chks_')&&['USDC','USDT','USDe','USDG'].includes(status.asset))order.asset=status.asset
  // Circle attaches the canonical receipt to its payment attempt. Prefer its
  // complete URL: legacy receiptId fields can be shorter than signed IDs.
  const receiptUrl=status.paymentAttempt?.receiptUrl||status.payment?.receiptUrl
  const canonical=typeof receiptUrl==='string'?/^\/receipt\/([a-zA-Z0-9_.-]{8,1024})$/.exec(receiptUrl)?.[1]:undefined
  const receiptId=canonical||status.paymentAttempt?.receiptId||status.payment?.receiptId
  if(typeof receiptId==='string'&&/^[a-zA-Z0-9_.-]{8,1024}$/.test(receiptId))order.receiptId=receiptId
  else if(/^chk_[a-zA-Z0-9]{8,40}$/.test(status.selectedCheckoutId||order.checkoutId))order.receiptId=status.selectedCheckoutId||order.checkoutId
  if(order.orderPrice||order.checkoutId.startsWith('chks_')&&order.settlementMode!=='usdc')order.payableAmount=paidAmount
  order.settlementMode=expectedSettlement;order.paid=true;order.network=status.network||status.checkout?.network||(order.rail==='bsc'?'bsc':'xlayer')
  await d.mutate(s=>{s.orders[order.id].settlementMode=order.settlementMode;s.orders[order.id].payableAmount=order.payableAmount;s.orders[order.id].paid=true;s.orders[order.id].receiptId=order.receiptId;s.orders[order.id].asset=order.asset;s.orders[order.id].network=order.network;return s})
  return 'paid'
 }
 if(order.paid)return 'paid'
 return ['expired','failed','processing'].includes(status.status)?status.status as 'expired'|'failed'|'processing':'pending'
}
export async function reconcileFoodDemoCheckout(checkoutId:string) {
 const state=await defaults.read()
 const sessionId=await (await import('./checkout-selection.js')).checkoutSelectionForChild(checkoutId)
 const order=Object.values(state.orders).find(order=>order.checkoutId===checkoutId||sessionId&&order.checkoutId===sessionId)
 if(!order)throw Error('Order is not available for reconciliation yet.')
 await refreshFoodOrder(defaults,order)
 if(!order.paid)throw Error('Payment is not confirmed by the checkout API yet.')
}
function sameOrderLines(a:Order['lines'],b:Order['lines']) {
 return a.length===b.length && a.every((line,i)=>line.id===b[i].id&&line.name===b[i].name&&line.quantity===b[i].quantity&&line.cents===b[i].cents)
}
async function prepareHostedOrder(d:typeof defaults,id:string,items:unknown,quoteId?:string){
 if(!/^[a-f0-9]{32}$/.test(id))throw Error('Invalid order reference.')
 const state=await d.read(),existing=state.orders[id],draft=state.drafts?.[id]
 const basket=foodBasket(items ?? (existing?.lines || draft?.lines)?.map(line=>({id:line.id,quantity:line.quantity})))
 if(existing && !sameOrderLines(existing.lines,basket.lines))throw Error('Order reference conflict.')
 if(existing?.checkoutUrl)return {ok:true,checkoutUrl:existing.checkoutUrl,orderId:id}
 if(existing&&!existing.hosted)throw Error('Start a new order to use secure checkout.')
 const createdAt=existing?.createdAt ?? draft?.createdAt ?? d.now()
 if(d.now()-createdAt>25*60_000)throw Error('Order expired. Start a new basket.')
 let orderPrice=existing?.orderPrice
 if(!existing&&await d.ngnPricing()){
  const quote=state.menuQuote
  if(!quote||quote.id!==quoteId||quote.expiresAt<=d.now())throw Error('Menu prices expired. Refresh prices and review your basket again.')
  const kobo=basket.lines.reduce((sum,line)=>sum+BigInt(quote.prices[line.id])*BigInt(line.quantity),0n)
  orderPrice={currency:'NGN',amount:formatUnits(kobo,2)}
 }
 const amount=existing?.amount??orderPrice?.amount??formatUnits(BigInt(basket.cents)*10000n,6)
 const order:Order={...(orderPrice?{orderPrice}:{}),id,hosted:true,fingerprint:createHash('sha256').update(JSON.stringify(basket.lines)).digest('hex'),...basket,asset:'USDC',amount,createdAt}
 await d.mutate(store=>{
  const current=store.orders[id]
  if(current && (!sameOrderLines(current.lines,basket.lines)||!current.hosted))throw Error('Order reference conflict.')
  if(!current){if(Object.keys(store.orders).length>=1000)throw Error('Orders are currently unavailable.');store.orders[id]=order}
  return store
 })
 // The merchant specifies the order, not receiving wallets or provider routes.
 const made=await d.call('',{kind:'service',checkoutMode:'human',...(await d.selectionEnabled()?{paymentSelection:'stablecoins'}:{asset:'USDC'}),amount,...(orderPrice?{currency:orderPrice.currency}:{}),title:'Lunchroom order '+id.slice(0,6),expiresInMinutes:15,returnUrl:'https://app.hashpaylink.com/launchroom?order='+id},'food-demo:hosted:'+id)
 const checkoutId=String(made.checkoutId||''),url=new URL(made.checkoutUrl,'https://app.hashpaylink.com')
 if(!/^(?:chk_[a-zA-Z0-9]{8,40}|chk[bxs]_[a-f0-9]{24})$/.test(checkoutId)||url.origin!=='https://app.hashpaylink.com'||url.pathname!=='/pay/c/'+checkoutId||!String(made.checkoutUrl).startsWith('/pay/c/'))throw Error('Invalid checkout response.')
 if(orderPrice){const returned=made.pricing||made.checkout?.pricing;const selected=made.checkout?.selectionCheckout&&made.checkout.currency===orderPrice.currency&&made.checkout.amount===orderPrice.amount;if(!selected&&(!returned||returned.currency!==orderPrice.currency||returned.amount!==orderPrice.amount))throw Error('Checkout price did not match the order.')}
 const rail=checkoutId.startsWith('chkb_')?'bsc':checkoutId.startsWith('chkx_')?'xlayer':'circle'
 const settlementMode=made.settlementMode||'usdc',payableAmount=String(made.amount||made.checkout?.amount||amount)
 if(!['usdc','ngn','ugx'].includes(settlementMode)||!/^\d+(\.\d{1,18})?$/.test(payableAmount)||Number(payableAmount)<=0||(made.checkout?.asset&&made.checkout.asset!=='USDC')||(!orderPrice&&settlementMode==='usdc'&&parseUnits(payableAmount,18)!==parseUnits(amount,18)))throw Error('Checkout amount or asset did not match the order.')
 await d.mutate(store=>{
  const current=store.orders[id]
  if(!current?.hosted || current.fingerprint!==order.fingerprint || current.checkoutId&&current.checkoutId!==checkoutId)throw Error('Order reference conflict.')
  Object.assign(current,{checkoutId,checkoutUrl:made.checkoutUrl,rail,settlementMode,payableAmount})
  return store
 })
 return {ok:true,checkoutUrl:made.checkoutUrl,orderId:id}
}
export function createFoodDemoHandler(overrides:Partial<typeof defaults>={}){const d={...defaults,...overrides};return async(req:Request,res:Response)=>{
 res.setHeader('Cache-Control','no-store')
 try{
  if(req.method==='GET'&&!req.query.id){
   const liveEnabled=Boolean(d.ready()),ngn=liveEnabled&&await d.ngnPricing()
   let quote:MenuQuote|undefined
   if(ngn){
    quote=(await d.read()).menuQuote
    if(!quote||quote.expiresAt<=d.now()){
     const rate=await d.rate()
     if(!Number.isFinite(rate)||rate<=0)throw Error('Menu prices are temporarily unavailable. Please try again.')
     const units=parseUnits(rate.toFixed(8),8)
     const next:MenuQuote={id:randomUUID(),expiresAt:d.now()+15*60_000,prices:Object.fromEntries(foodMenu.map(m=>[m.id,Number((BigInt(m.cents)*units+50_000_000n)/100_000_000n)]))}
     const saved=await d.mutate(state=>{if(!state.menuQuote||state.menuQuote.expiresAt<=d.now())state.menuQuote=next;return state});quote=saved.menuQuote!
    }
   }
   return res.json({ok:true,menu:foodMenu.map(m=>({...m,cents:quote?.prices[m.id]??m.cents})),currency:quote?'NGN':'USD',quoteId:quote?.id,quoteExpiresAt:quote?.expiresAt,liveEnabled,acceptedAssets:liveEnabled?[...new Set((await d.choices()).flatMap(c=>c.assets))]:[]})
  }
  if(!d.ready())return res.status(503).json({ok:false,error:'Payments are currently unavailable.'})
  if(req.method==='POST'&&req.body?.action==='prepare')return res.json(await prepareHostedOrder(d,String(req.body?.requestId||''),req.body?.items,req.body?.quoteId))
  if(req.method==='GET'&&req.query?.purpose==='selection'){
   const id=String(req.query.id||'');const state=await d.read();const draft=state.drafts?.[id]
   if(!draft||! /^[a-f0-9]{32}$/.test(id))return res.status(404).json({ok:false,error:'Order not found.'})
   if(state.orders[id]?.checkoutUrl)return res.json({ok:true,checkoutUrl:state.orders[id].checkoutUrl})
   if(d.now()-draft.createdAt>25*60_000)return res.status(410).json({ok:false,error:'Order expired. Return to the store.'})
   return res.json({ok:true,order:{id,merchant:'Lunchroom',cents:draft.cents},destinations:await d.choices(),checkoutUrl:state.orders[id]?.checkoutUrl})
  }
  if(req.method==='GET'){
   if(!/^[a-f0-9]{32}$/.test(String(req.query.id)))return res.status(404).json({ok:false,error:'Order not found.'})
   const order=(await d.read()).orders[String(req.query.id)];if(!order)return res.status(404).json({ok:false,error:'Order not found.'})
   const status=await refreshFoodOrder(d,order)
   return res.json({ok:true,order:{orderPrice:order.orderPrice,id:order.id,lines:order.lines,asset:order.asset,rail:order.rail||'xlayer',network:order.network,amount:order.payableAmount||order.amount,cents:order.cents,status,...(order.receiptId?{receiptUrl:'/receipt/'+encodeURIComponent(order.receiptId)}:{}),checkoutUrl:status==='pending'?order.checkoutUrl:undefined}})
  }
  if(req.method!=='POST')return res.sendStatus(405)
  if(await d.ngnPricing())throw Error('Start a new order using hosted checkout.')
  const id=String(req.body?.requestId||'');if(!/^[a-f0-9]{32}$/.test(id))throw Error('Invalid order reference.')
  if((await d.read()).orders[id]?.hosted)throw Error('Open the existing hosted checkout to continue.')
  const asset=req.body?.asset;if(asset!=='USDC')throw Error('Choose USDC. Checkout accepts stablecoins only.')
  const rail=req.body?.rail??'xlayer';if(rail!=='circle'&&rail!=='xlayer')throw Error('Unsupported payment rail.');if(asset==='NVDAx'&&rail!=='xlayer')throw Error('NVIDIA xStock is available on X Layer only.')
  const draft=(await d.read()).drafts?.[id];if(draft&&d.now()-draft.createdAt>25*60_000)return res.status(410).json({ok:false,error:'Order expired. Return to the store.'})
  const selectedNetwork=rail==='circle'?String(req.body?.network||''):''
  if(draft){const choices=await d.choices();const choice=choices.find(c=>c.id===rail);if(!choice?.assets.includes(asset))throw Error('This payment option is not enabled by the store.');if(rail==='circle'&&!choice.networks?.includes(selectedNetwork))throw Error('Choose an enabled network.')}
  const basket=foodBasket(draft?draft.lines.map(line=>({id:line.id,quantity:line.quantity})):req.body?.items),fingerprint=createHash('sha256').update(JSON.stringify([basket.lines,asset,rail,selectedNetwork])).digest('hex')
  let order=(await d.read()).orders[id]
  if(order&&order.fingerprint!==fingerprint)return res.status(409).json({ok:false,error:'This order reference belongs to a different basket.'})
  if(!order){
   const token=asset==='USDC'?stockUsdc:stockAssets.find(a=>a.symbol==='NVDAx')!;const price=asset==='USDC'?1:await d.price(token.address)
   if(!price||!Number.isFinite(price)||price<=0)throw Error('A fresh asset price is unavailable. Try again shortly.')
   const decimals=asset==='USDC'?6:18,rate=parseUnits(price.toFixed(18),18),numerator=BigInt(basket.cents)*10n**BigInt(decimals+18),denominator=100n*rate
   order={id,fingerprint,...basket,asset,rail,selectedNetwork,amount:formatUnits((numerator+denominator-1n)/denominator,decimals),createdAt:d.now()}
   const saved=await d.mutate(s=>{if(!s.orders[id]){if(Object.keys(s.orders).length>=1000)throw Error('Orders are currently unavailable.');s.orders[id]=order!}return s});order=saved.orders[id]
   if(order.fingerprint!==fingerprint)return res.status(409).json({ok:false,error:'Order reference conflict.'})
  }
  if(d.now()-order.createdAt>25*60_000)return res.status(410).json({ok:false,error:'Order expired. Start a new basket.'})
  if(!order.checkoutId){
   const made=await d.call('',{...(order.rail==='circle'?{kind:'service',checkoutMode:'human',...(order.selectedNetwork?{defaultNetwork:order.selectedNetwork}:{})}:{rail:'xlayer',kind:'payment'}),asset:order.asset,amount:order.amount,title:'Lunchroom order '+id.slice(0,6),swap:false,returnUrl:'https://app.hashpaylink.com/launchroom?order='+id},'food-demo:'+id)
   const url=new URL(made.checkoutUrl,'https://app.hashpaylink.com');const validId=order.rail==='circle'?/^chk_[a-zA-Z0-9]{8,40}$/.test(made.checkoutId):/^chkx_[a-f0-9]{24}$/.test(made.checkoutId);if(!validId||url.origin!=='https://app.hashpaylink.com'||url.pathname!=='/pay/c/'+made.checkoutId||!String(made.checkoutUrl).startsWith('/pay/c/'))throw Error('Invalid checkout response.')
   const settlementMode=made.settlementMode||'usdc',payableAmount=made.amount||order.amount
   if(order.rail==='circle'&&(!['usdc','ngn','ugx'].includes(settlementMode)||!/^\d+(\.\d{1,6})?$/.test(payableAmount)||Number(payableAmount)<=0))throw Error('Invalid checkout amount.')
   await d.mutate(s=>{s.orders[id].checkoutId=made.checkoutId;s.orders[id].checkoutUrl=made.checkoutUrl;if(order.rail==='circle'){s.orders[id].settlementMode=settlementMode;s.orders[id].payableAmount=payableAmount}return s});order.checkoutId=made.checkoutId;order.checkoutUrl=made.checkoutUrl
  }
  return res.json({ok:true,checkoutUrl:order.checkoutUrl,orderId:id})
 }catch(e){return res.status(400).json({ok:false,error:(e as Error).message})}
}}
export default createFoodDemoHandler()
