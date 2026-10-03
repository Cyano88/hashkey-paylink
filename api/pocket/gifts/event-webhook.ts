import {createPublicKey,verify,type KeyObject} from 'node:crypto'
import {queryDurablePostgres} from '../../render-durable-store.js'
import {durableGiftStore} from './store.js'
import {GIFT_DEPLOYMENTS} from './index.js'
import {MULTI_GIFT_DEPLOYMENTS} from './multi-deployment.js'
import type {Hex} from 'viem'
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,hash=/^0x[a-f0-9]{64}$/i
const keys=new Map<string,KeyObject>()
export async function circleNotificationKey(id:string){
 const cached=keys.get(id);if(cached)return cached
 const response=await fetch('https://api.circle.com/v2/notifications/publicKey/'+id,{headers:{Authorization:'Bearer '+process.env.CIRCLE_API_KEY},signal:AbortSignal.timeout(5000),redirect:'error'})
 if(!response.ok)throw Error('Notification key unavailable')
 const body=await response.json(),data=body.data
 if(data?.id!==id||data.algorithm!=='ECDSA_SHA_256'||typeof data.publicKey!=='string')throw Error('Invalid notification key')
 const key=createPublicKey({key:Buffer.from(data.publicKey,'base64'),format:'der',type:'spki'})
 if(key.asymmetricKeyType!=='ec')throw Error('Invalid notification key type')
 if(keys.size>=32)keys.delete(keys.keys().next().value!)
 keys.set(id,key);return key
}
export function createGiftEventWebhook(deps:{key(id:string):Promise<KeyObject>;contracts():string[];save(escrow:string,giftId:Hex,tx:Hex):Promise<void>}){
 return async(req:any,res:any)=>{
  res.setHeader('Cache-Control','no-store')
  if(req.method==='HEAD')return res.status(200).end()
  if(req.method!=='POST')return res.status(405).end()
  const keyId=req.headers['x-circle-key-id'],signature=req.headers['x-circle-signature']
  if(!Buffer.isBuffer(req.body)||req.body.length>32768||typeof keyId!=='string'||!uuid.test(keyId)||typeof signature!=='string'||signature.length>256||!/^[a-zA-Z0-9+/]+={0,2}$/.test(signature))return res.status(401).json({ok:false})
  try{
   const key=await deps.key(keyId)
   if(!verify('sha256',req.body,key,Buffer.from(signature,'base64')))return res.status(401).json({ok:false})
   const body=JSON.parse(req.body.toString('utf8'))
   if(body.notificationType!=='contracts.eventLog')return res.status(200).json({ok:true})
   const n=body.notification
   if(n?.blockchain!=='BASE'||typeof n.contractAddress!=='string'||!deps.contracts().some(a=>a.toLowerCase()===n.contractAddress.toLowerCase())||!hash.test(n.txHash||'')||!Array.isArray(n.topics)||!hash.test(n.topics[1]||''))return res.status(200).json({ok:true})
   // Only wake existing gifts. Payloads never mark a gift funded/claimed or create receipts.
   await deps.save(n.contractAddress,n.topics[1],n.txHash)
   return res.status(200).json({ok:true})
  }catch{return res.status(503).json({ok:false})}
 }
}
export default createGiftEventWebhook({key:circleNotificationKey,contracts:()=>[GIFT_DEPLOYMENTS.base!.escrow,MULTI_GIFT_DEPLOYMENTS.base!.escrow],save:async(escrow,giftId,tx)=>{
 const found=await queryDurablePostgres("select value->>'id' as id from render_durable_kv where store_key like 'hashpaylink:pocket-gift:v1:%' and value->'deployment'->>'network'='base' and lower(value->'deployment'->>'escrow')=lower($1) and lower(value->>'giftId')=lower($2) limit 1",[escrow,giftId])
 const id=found.rows[0]?.id;if(!id)return
 await durableGiftStore.update(id,r=>{
  if(!r)throw Error('Gift missing')
  if(r.eventHints?.includes(tx))return r
  return {...r,eventHints:[...(r.eventHints||[]),tx].slice(-1004),nextReconcileAt:0,reconcileComplete:false}
 })
}})
