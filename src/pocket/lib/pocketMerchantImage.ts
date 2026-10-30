import {HASH_PAYLINK_APP_ORIGIN,POCKET_ORIGIN,isPocketNativeRuntime} from './pocketRoutes'

export function pocketMerchantImageUrl(value?:string,native=isPocketNativeRuntime()):string|undefined{
 if(!value) return undefined
 const relative=value.startsWith('/')&&!value.startsWith('//')
 if(!relative&&!value.startsWith('https://')) return undefined
 try{
  const url=new URL(value,HASH_PAYLINK_APP_ORIGIN)
  if(url.username||url.password) return undefined
  // Capacitor serves the app hostname from its bundled assets. Fetch hosted
  // merchant images through the public Pocket host instead on native devices.
  if(native&&url.origin===HASH_PAYLINK_APP_ORIGIN) return POCKET_ORIGIN+url.pathname+url.search+url.hash
  return relative?value:url.href
 }catch{return undefined}
}
