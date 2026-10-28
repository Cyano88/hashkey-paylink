import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto'
import type {Request,Response} from 'express'
import {hasRenderDurableStore,readDurableJson,mutateDurableJson} from './render-durable-store.js'
import {resolveDeveloperApiKeyPolicy,resolveCheckoutSelectionPolicy,type DeveloperCheckoutPolicy} from './developer-projects.js'
import {acceptedCheckoutAssets} from '../src/lib/checkoutAcceptance.js'
import {CHECKOUT_NETWORK_ORDER,checkoutStablecoins} from '../src/lib/checkoutStablecoins.js'

const KEY='hashpaylink:checkout-selections:v1'
export const isCheckoutSelection=(id:unknown):id is string=>typeof id==='string'&&/^chks_[a-f0-9]{24}$/.test(id)
type Option={network:string;asset:string;recipient:string}
type Selection={defaultNetwork:string;id:string;projectId:string;amount:string;title:string;merchantName:string;brandImageUrl?:string;returnUrl:string;expiresAt:string;options:Option[];requestHash:string;choice?:Option;checkoutId?:string;checkoutUrl?:string;integrity:string}
type Store={sessions:Record<string,Selection>;keys:Record<string,string>}
type Child=(policy:DeveloperCheckoutPolicy,record:Selection)=>Promise<{checkoutId:string;checkoutUrl:string}>
const defaults={ready:hasRenderDurableStore,secret:()=>process.env.HOSTED_CHECKOUT_SIGNING_SECRET||'',now:Date.now,read:async()=>await readDurableJson<Store>(KEY)||{sessions:{},keys:{}},mutate:(fn:(s:Store)=>Store)=>mutateDurableJson<Store>(KEY,s=>fn(s||{sessions:{},keys:{}})),policy:resolveDeveloperApiKeyPolicy,currentPolicy:resolveCheckoutSelectionPolicy,enabled:(network:string,id:string)=>network!=='bsc'&&network!=='xlayer'||process.env[network==='bsc'?'HASHPAYLINK_BSC_CHECKOUT_ENABLED':'HASHPAYLINK_XSTOCKS_CHECKOUT_ENABLED']==='true'&&(process.env[network==='bsc'?'HASHPAYLINK_BSC_CHECKOUT_PROJECTS':'HASHPAYLINK_XSTOCKS_CHECKOUT_PROJECTS']||'').split(',').map(s=>s.trim()).includes(id)}
function sign(r:Selection,secret:string){return createHmac('sha256',secret).update(JSON.stringify([r.id,r.defaultNetwork,r.projectId,r.amount,r.title,r.merchantName,r.brandImageUrl||'',r.returnUrl,r.expiresAt,r.options.map(o=>[o.network,o.asset,o.recipient]),r.requestHash,r.choice?[r.choice.network,r.choice.asset,r.choice.recipient]:null,r.checkoutId||'',r.checkoutUrl||''])).digest('hex')}
function valid(r:Selection|undefined,secret:string):r is Selection{return !!r&&secret.length>=32&&/^[a-f0-9]{64}$/.test(r.integrity)&&timingSafeEqual(Buffer.from(r.integrity,'hex'),Buffer.from(sign(r,secret),'hex'))}
function options(p:DeveloperCheckoutPolicy,enabled:typeof defaults.enabled):Option[]{
 const list=p.paymentOptions.flatMap(o=>acceptedCheckoutAssets(o.network,p.acceptedAssets).map(asset=>({...o,asset}))) as Option[]
 for(const network of ['xlayer','bsc'] as const){const config=network==='xlayer'?p.xlayerCheckout:p.bscCheckout;if(config&&enabled(network,p.partnerId))for(const token of checkoutStablecoins(network)){if(config.assets.includes(token.address.toLowerCase()))list.push({network,asset:token.symbol,recipient:config.recipient})}}
 return list.sort((a,b)=>CHECKOUT_NETWORK_ORDER.indexOf(a.network as any)-CHECKOUT_NETWORK_ORDER.indexOf(b.network as any))
}
function publicRecord(r:Selection){return {ok:true,checkoutId:r.id,checkoutUrl:'/pay/c/'+r.id,returnUrl:r.returnUrl,checkout:{id:r.id,selectionCheckout:true,defaultNetwork:r.defaultNetwork,amount:r.amount,merchantName:r.merchantName,brandImageUrl:r.brandImageUrl,title:r.title,expiresAt:r.expiresAt,status:'pending',options:r.options.map(({network,asset})=>({network,asset})),selected:r.choice?{network:r.choice.network,asset:r.choice.asset}:undefined},...(r.checkoutUrl?{selectedCheckoutUrl:r.checkoutUrl,selectedCheckoutId:r.checkoutId}:{})}}
export async function checkoutSelectionForChild(childId:string){if(!defaults.ready())return undefined;return Object.values((await defaults.read()).sessions).find(r=>r.checkoutId===childId&&valid(r,defaults.secret()))?.id}
export function createCheckoutSelectionHandler(child:Child,overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 return async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  try{
   if(!d.ready()||d.secret().length<32)return res.status(503).json({ok:false,error:'Checkout is unavailable.'})
   const id=String(req.query.id||'')
   if(isCheckoutSelection(id)){
    let r=(await d.read()).sessions[id]
    if(!valid(r,d.secret()))return res.status(404).json({ok:false,error:'Checkout not found.'})
    if(req.method==='GET'){
     if(req.query.purpose==='status'){const p=await d.policy(req);if(p?.partnerId!==r.projectId)return res.status(401).json({ok:false,error:'Valid project credentials required.'})}
     if(req.query.purpose==='status')return res.json({...publicRecord(r),status:!r.checkoutId&&Date.parse(r.expiresAt)<=d.now()?'expired':'pending'})
     if(!r.checkoutId&&Date.parse(r.expiresAt)<=d.now())return res.status(410).json({ok:false,error:'Checkout expired.',returnUrl:r.returnUrl,merchantName:r.merchantName,brandImageUrl:r.brandImageUrl})
     return res.json(publicRecord(r))
    }
    if(req.method!=='POST'||req.query.action!=='select-payment')return res.sendStatus(405)
    const p=await d.currentPolicy(r.projectId)
    if(!p||p.checkoutMode!=='human'||p.settlementMode!=='usdc'||!p.capabilities.includes('hosted_checkout'))throw Error('This checkout is not accepting payments.')
    if(r.checkoutUrl)return res.json(publicRecord(r))
    const chosen=r.options.find(o=>o.network===req.body?.network&&o.asset===req.body?.asset)
    if(!chosen||!options(p,d.enabled).some(o=>o.network===chosen.network&&o.asset===chosen.asset&&o.recipient===chosen.recipient))throw Error('This payment option is no longer available. Return to the store.')
    await d.mutate(s=>{const current=s.sessions[id];if(!valid(current,d.secret())||Date.parse(current.expiresAt)<=d.now())throw Error('Checkout expired.');if(current.choice&&(current.choice.network!==chosen.network||current.choice.asset!==chosen.asset))throw Error('This checkout already has a payment option. Reopen it to continue.');current.choice=chosen;current.integrity=sign(current,d.secret());return s})
    r=(await d.read()).sessions[id]
    if(!valid(r,d.secret()))throw Error('Checkout could not be verified.')
    // Concurrent requests share one immutable route and one child idempotency key.
    const made=await child(p,r)
    if(!/^chk(?:b|x)?_[a-zA-Z0-9]{8,40}$/.test(made.checkoutId)||!made.checkoutUrl.startsWith('/pay/c/'+made.checkoutId))throw Error('Checkout could not be verified.')
    await d.mutate(s=>{const current=s.sessions[id];if(!valid(current,d.secret())||current.checkoutId&&current.checkoutId!==made.checkoutId)throw Error('Checkout conflict.');current.checkoutId=made.checkoutId;current.checkoutUrl=made.checkoutUrl;current.integrity=sign(current,d.secret());return s})
    return res.json(publicRecord((await d.read()).sessions[id]))
   }
   if(req.method!=='POST')return res.sendStatus(405)
   if(req.body?.checkoutMode!==undefined&&req.body.checkoutMode!=='human'||req.body?.swap||req.body?.agenticType)throw Error('Stablecoin selection supports human payments without swaps.')
   const p=await d.policy(req)
   if(!p||p.environment!=='live'||p.checkoutMode!=='human'||p.settlementMode!=='usdc'||!p.capabilities.includes('hosted_checkout'))return res.status(403).json({ok:false,error:'Stablecoin selection requires a live stablecoin Checkout app.'})
   if(req.body?.asset!==undefined||req.body?.recipient!==undefined||req.body?.network!==undefined||req.body?.paymentOptions!==undefined||req.body?.rail!==undefined||req.body?.flexible||req.body?.providerFunding)throw Error('Use the saved payment options without a fixed asset or receiving address.')
   const amount=String(req.body?.amount||''),title=String(req.body?.title||'Payment request').trim().slice(0,100),returnUrl=String(req.body?.returnUrl||'')
   if(!/^\d{1,6}(\.\d{1,6})?$/.test(amount)||Number(amount)<=0||Number(amount)>100000)throw Error('Enter a valid stablecoin amount.')
   if(!returnUrl.startsWith('https://')||!p.allowedOrigins.includes(new URL(returnUrl).origin))throw Error('Use an allowlisted HTTPS return URL.')
   const minutes=Number(req.body?.expiresInMinutes??15)
   if(!Number.isInteger(minutes)||minutes<5||minutes>1440)throw Error('Expiry must be between 5 and 1440 minutes.')
   const key=String(req.headers['idempotency-key']||'')
   if(!/^[a-zA-Z0-9:_-]{16,128}$/.test(key))throw Error('A valid Idempotency-Key header is required.')
   const hash=createHash('sha256').update(JSON.stringify([amount,title,returnUrl,minutes])).digest('hex'),scope=p.partnerId+':'+key
   let result:Selection|undefined
   await d.mutate(s=>{const existing=s.sessions[s.keys[scope]];if(existing){if(!valid(existing,d.secret())||existing.requestHash!==hash)throw Error('Idempotency key conflict.');result=existing;return s}if(Object.keys(s.sessions).length>=20000)throw Error('Checkout capacity reached.');const available=options(p,d.enabled);if(!available.length)throw Error('No payment options are available.');const r:Selection={defaultNetwork:p.checkoutDefaultNetwork||p.defaultNetwork,id:'chks_'+randomUUID().replace(/-/g,'').slice(0,24),projectId:p.partnerId,amount,title,merchantName:p.merchantName,brandImageUrl:p.brandImageUrl,returnUrl,expiresAt:new Date(d.now()+minutes*60000).toISOString(),options:available,requestHash:hash,integrity:''};r.integrity=sign(r,d.secret());s.sessions[r.id]=r;s.keys[scope]=r.id;result=r;return s})
   return res.status(201).json(publicRecord(result!))
  }catch(e){return res.status(409).json({ok:false,error:e instanceof Error?e.message:'Checkout could not be prepared.'})}
 }
}
