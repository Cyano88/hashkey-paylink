import {checkoutStablecoin} from '../../lib/checkoutStablecoins.js'
import {acceptedCheckoutAssets} from '../../lib/checkoutAcceptance.js'
import type {XPayDestination} from './pocketUnifiedXPay.js'

export type XPayAcceptedRoute = {destinationId:string;revision:string;network:string;asset:string}
export type XPayAcceptance = {version:1;routes:XPayAcceptedRoute[];cashBalance:false}
const fail = () => Object.assign(Error('Choose payment options available for this terminal.'),{status:400})
const key = (r:XPayAcceptedRoute) => JSON.stringify([r.destinationId,r.revision,r.network,r.asset])

/** Receiving ownership is checked by the API. Intersect its verified destinations
 * with executable routes, never with the broader wallet token catalogue. */
export function xpayAvailableRoutes(destinations:XPayDestination[]):XPayAcceptedRoute[]{
 return destinations.flatMap(d=>{
  // Legacy stock configuration remains separate; this schema does not activate it.
  if(d.kind==='xstocks')return []
  const networks=d.kind==='bank'?['base']:d.networks||[]
  return networks.flatMap(network=>d.assets.filter(asset=>
   d.adapter?network===d.adapter&&!!checkoutStablecoin(network,asset):asset==='USDC'&&acceptedCheckoutAssets(network).includes(asset)
  ).map(asset=>({destinationId:d.id,revision:d.revision,network,asset})))
 })
}

export function normalizeXPayAcceptance(value:unknown,destinations:XPayDestination[]):XPayAcceptance{
 const available=xpayAvailableRoutes(destinations)
 if(value===undefined)return {version:1,routes:available,cashBalance:false}
 if(!value||typeof value!=='object'||Array.isArray(value))throw fail()
 const input=value as Record<string,unknown>
 if(Object.keys(input).some(k=>!['version','routes','cashBalance'].includes(k))||input.version!==1||input.cashBalance!==false||!Array.isArray(input.routes)||input.routes.length>available.length)throw fail()
 const allowed=new Map(available.map(r=>[key(r),r])),seen=new Set<string>()
 const routes=input.routes.map(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['destinationId','revision','network','asset'].includes(k)))throw fail()
  const candidate=value as XPayAcceptedRoute,id=key(candidate),route=allowed.get(id)
  if(!route||seen.has(id))throw fail()
  seen.add(id);return {...route}
 })
 // A receiving destination must retain a usable payment option.
 if(destinations.some(d=>d.kind!=='xstocks'&&!routes.some(r=>r.destinationId===d.id)))throw fail()
 return {version:1,routes,cashBalance:false}
}

/** Older clients may edit destinations without knowing about acceptance. Preserve
 * their existing restrictions; only newly attached destinations get defaults. */
export function reconcileXPayAcceptance(previous:XPayAcceptance|undefined,destinations:XPayDestination[]):XPayAcceptance{
 if(!previous)return normalizeXPayAcceptance(undefined,destinations)
 const available=xpayAvailableRoutes(destinations)
 return normalizeXPayAcceptance({version:1,cashBalance:false,routes:available.filter(r=>
  !previous.routes.some(p=>p.destinationId===r.destinationId)||previous.routes.some(p=>p.destinationId===r.destinationId&&p.network===r.network&&p.asset===r.asset)
 )},destinations)
}

export function xpayAcceptedDestinations(destinations:XPayDestination[],acceptance:XPayAcceptance):XPayDestination[]{
 return destinations.map(d=>d.kind==='xstocks'?d:{...d,
  assets:[...new Set(acceptance.routes.filter(r=>r.destinationId===d.id).map(r=>r.asset))],
  networks:[...new Set(acceptance.routes.filter(r=>r.destinationId===d.id).map(r=>r.network))],
 })
}
