import {resolveDeveloperApiKeyPolicy} from './developer-projects.js'
import type {XPayDestination} from '../src/pocket/lib/pocketUnifiedXPay.js'
import type {Request,Response} from 'express'
import {createHash} from 'node:crypto'
import {formatUnits,parseUnits} from 'viem'
import {foodBasket,foodMenu,type FoodAsset} from '../src/lib/foodDemo.js'
import {hasRenderDurableStore,readDurableJson,mutateDurableJson} from './render-durable-store.js'
import {readStockMarketPrices} from './pocket/xstocks-prices.js'
import {stockAssets,stockUsdc} from '../src/pocket/lib/pocketXStocksWallet.js'
const STORE='hashpaylink:food-demo-orders:v1'
type Order={id:string;fingerprint:string;lines:ReturnType<typeof foodBasket>['lines'];cents:number;asset:FoodAsset;rail?:'circle'|'xlayer';network?:string;selectedNetwork?:string;amount:string;createdAt:number;checkoutId?:string;checkoutUrl?:string;paid?:boolean}
type Draft={id:string;lines:ReturnType<typeof foodBasket>['lines'];cents:number;createdAt:number}
type Store={orders:Record<string,Order>;drafts?:Record<string,Draft>}
async function projectChoices():Promise<XPayDestination[]>{
 const policy=await resolveDeveloperApiKeyPolicy({headers:{'x-api-key':process.env.FOOD_DEMO_PROJECT_KEY||''},method:'POST',originalUrl:'/api/v2/checkouts',body:{}})
 if(!policy||policy.environment!=='live'||policy.checkoutMode!=='human'||!policy.capabilities.includes('hosted_checkout')||policy.settlementMode!=='usdc')throw Error('Checkout is not configured for this store.')
 const choices:XPayDestination[]=[]
 const networks=policy.paymentOptions.map(p=>p.network).filter(n=>['base','arbitrum','arc'].includes(n))
 if(networks.length)choices.push({id:'circle',name:policy.merchantName,kind:'stablecoins',currency:'USD',assets:['USDC'],networks,revision:'1'})
 const assets=[stockUsdc,...stockAssets].filter(a=>['USDC','NVDAx'].includes(a.symbol)&&policy.xlayerCheckout?.assets.includes(a.address.toLowerCase())).map(a=>a.symbol)
 if(assets.length&&process.env.HASHPAYLINK_XSTOCKS_CHECKOUT_ENABLED==='true'&&(process.env.HASHPAYLINK_XSTOCKS_CHECKOUT_PROJECTS||'').split(',').map(s=>s.trim()).includes(policy.partnerId))choices.push({id:'xlayer',name:policy.merchantName,kind:'xstocks',currency:'USD',assets,networks:['xlayer'],revision:'1'})
 return choices
}
const defaults={choices:projectChoices,read:async()=>await readDurableJson<Store>(STORE)||{orders:{}},mutate:(fn:(s:Store)=>Store)=>mutateDurableJson<Store>(STORE,s=>fn(s||{orders:{}})),ready:()=>hasRenderDurableStore()&&process.env.FOOD_DEMO_ENABLED==='true'&&!!process.env.FOOD_DEMO_PROJECT_KEY,now:Date.now,price:async(address:string)=>(await readStockMarketPrices([address.toLowerCase()]))[address.toLowerCase()]?.usd,call:async(path:string,body?:unknown,key?:string)=>{
 const response=await fetch('https://app.hashpaylink.com/api/v2/checkouts'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-API-Key':process.env.FOOD_DEMO_PROJECT_KEY||'',...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000),redirect:'error'});
 const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw Error('Payment is unavailable. Your order has not been charged.');return data
}}
export function createFoodDemoHandler(overrides:Partial<typeof defaults>={}){const d={...defaults,...overrides};return async(req:Request,res:Response)=>{
 res.setHeader('Cache-Control','no-store')
 try{
  if(req.method==='GET'&&!req.query.id)return res.json({ok:true,menu:foodMenu,liveEnabled:Boolean(d.ready())})
  if(!d.ready())return res.status(503).json({ok:false,error:'Payments are currently unavailable.'})
  if(req.method==='POST'&&req.body?.action==='prepare'){
   const id=String(req.body?.requestId||'');if(!/^[a-f0-9]{32}$/.test(id))throw Error('Invalid order reference.')
   const basket=foodBasket(req.body?.items)
   await d.mutate(s=>{s.drafts??={};const old=s.drafts[id];if(old&&JSON.stringify(old.lines)!==JSON.stringify(basket.lines))throw Error('Order reference conflict.');if(!old){if(Object.keys(s.drafts).length>=1000)throw Error('Orders are currently unavailable.');s.drafts[id]={id,...basket,createdAt:d.now()}}return s})
   return res.json({ok:true,checkoutUrl:'/pay/order/'+id,orderId:id})
  }
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
   if(order.checkoutId&&!order.paid){const status=await d.call('?id='+encodeURIComponent(order.checkoutId)+'&purpose=status');if(status.status==='paid'&&(order.rail==='circle'?status.checkoutId===order.checkoutId&&status.settlementMode==='usdc'&&status.payment?.amount===order.amount:status.checkout?.id===order.checkoutId&&status.checkout.asset===order.asset&&status.checkout.amount===order.amount)){await d.mutate(s=>{s.orders[order.id].paid=true;s.orders[order.id].network=status.network||'xlayer';return s});order.paid=true;order.network=status.network||'xlayer'}}
   return res.json({ok:true,order:{id:order.id,lines:order.lines,asset:order.asset,rail:order.rail||'xlayer',network:order.network,amount:order.amount,cents:order.cents,status:order.paid?'paid':'pending'}})
  }
  if(req.method!=='POST')return res.sendStatus(405)
  const id=String(req.body?.requestId||'');if(!/^[a-f0-9]{32}$/.test(id))throw Error('Invalid order reference.')
  const asset=req.body?.asset;if(asset!=='USDC'&&asset!=='NVDAx')throw Error('Choose USDC or NVDAx.')
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
   const made=await d.call('',{...(order.rail==='circle'?{kind:'service',checkoutMode:'human',...(order.selectedNetwork?{defaultNetwork:order.selectedNetwork}:{})}:{rail:'xlayer',kind:'payment'}),asset:order.asset,amount:order.amount,title:'Lunchroom order '+id.slice(0,6),swap:false,returnUrl:'https://app.hashpaylink.com/demo/food?order='+id},'food-demo:'+id)
   const url=new URL(made.checkoutUrl,'https://app.hashpaylink.com');const validId=order.rail==='circle'?/^chk_[a-zA-Z0-9]{8,40}$/.test(made.checkoutId):/^chkx_[a-f0-9]{24}$/.test(made.checkoutId);if(!validId||url.origin!=='https://app.hashpaylink.com'||url.pathname!=='/pay/c/'+made.checkoutId||!String(made.checkoutUrl).startsWith('/pay/c/'))throw Error('Invalid checkout response.')
   await d.mutate(s=>{s.orders[id].checkoutId=made.checkoutId;s.orders[id].checkoutUrl=made.checkoutUrl;return s});order.checkoutId=made.checkoutId;order.checkoutUrl=made.checkoutUrl
  }
  return res.json({ok:true,checkoutUrl:order.checkoutUrl,orderId:id})
 }catch(e){return res.status(400).json({ok:false,error:(e as Error).message})}
}}
export default createFoodDemoHandler()
