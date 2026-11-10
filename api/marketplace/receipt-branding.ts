import {readDurableJson} from '../render-durable-store.js'
import {productDisplayName} from '../../src/lib/retiredProductPresentation.js'
/** Use the registered app name, never a client-supplied settlement label. */
export async function marketplaceReceiptNames():Promise<Record<string,string>>{
 const store=await readDurableJson<{projects:Record<string,{name:string}>}>((process.env.DEVELOPER_PROJECT_STORE_KEY??'hashpaylink:developer-projects:v1').trim())
 return Object.fromEntries(Object.entries(store?.projects||{}).flatMap(([id,p])=>{
  const name=typeof p.name==='string'?productDisplayName(id,p.name).replace(/[\r\n\t]/g,' ').trim().slice(0,120):''
  return name?[[id,name]]:[]
 }))
}
