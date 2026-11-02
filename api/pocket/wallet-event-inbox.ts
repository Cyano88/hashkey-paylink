import {createHash,verify,type KeyObject} from 'node:crypto'
import {circleNotificationKey} from './circle-notification-key.js'
import {findPaymentCircleLinkByWallet} from '../privy-circle-link.js'
import {mutateDurableJson,queryDurablePostgres,withDurableSessionLock,hasRenderDurableStore} from '../render-durable-store.js'
import {persistObservedWalletActivity} from './activity-feed.js'
import {verifyWalletEvent} from './wallet-event-proof.js'
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const chains=new Set(['BASE','ARB','ARC','SOL','ETH','MATIC','POLYGON'])
export type WalletEvent={walletId:string;transactionId:string;blockchain:string;receivedAt:number;nextAt:number;attempts:number;done?:boolean}
const prefix='pocket:wallet-event:v1:'
export function walletEventKey(e:Pick<WalletEvent,'walletId'|'transactionId'>){return prefix+createHash('sha256').update(e.walletId+':'+e.transactionId).digest('hex')}
export function createWalletEventWebhook(d:{key(id:string):Promise<KeyObject>;save(event:WalletEvent):Promise<unknown>;now?:()=>number}){
 return async(req:any,res:any)=>{
  res.setHeader('Cache-Control','no-store')
  if(req.method==='HEAD')return res.status(200).end()
  if(req.method!=='POST')return res.status(405).end()
  const keyId=req.headers['x-circle-key-id'],signature=req.headers['x-circle-signature']
  if(!Buffer.isBuffer(req.body)||req.body.length>32768||typeof keyId!=='string'||!uuid.test(keyId)||typeof signature!=='string'||signature.length>256||!/^[a-zA-Z0-9+/]+={0,2}$/.test(signature))return res.status(401).json({ok:false})
  try{
   if(!verify('sha256',req.body,await d.key(keyId),Buffer.from(signature,'base64')))return res.status(401).json({ok:false})
   let body:any;try{body=JSON.parse(req.body.toString('utf8'))}catch{return res.status(400).json({ok:false})}
   if(!['transactions.inbound','transactions.outbound'].includes(body.notificationType))return res.status(200).json({ok:true})
   const n=body.notification
   if(!n||!uuid.test(n.id||'')||!uuid.test(n.walletId||'')||!chains.has(n.blockchain))return res.status(400).json({ok:false})
   if(!['CONFIRMED','COMPLETE'].includes(n.state))return res.status(200).json({ok:true})
   const now=(d.now||Date.now)()
   await d.save({walletId:n.walletId,transactionId:n.id,blockchain:n.blockchain,receivedAt:now,nextAt:now,attempts:0})
   return res.status(200).json({ok:true})
  }catch{return res.status(503).json({ok:false})}
 }
}
export default createWalletEventWebhook({key:circleNotificationKey,save:async event=>{
 // Ignore other products/unlinked wallets; never infer ownership from an address.
 const link=await findPaymentCircleLinkByWallet(event.walletId)
 if(!link||link.circleBlockchain!==event.blockchain)return
 await mutateDurableJson<WalletEvent>(walletEventKey(event),old=>old||event)
}})
let running=false
export async function drainWalletEvents(){
 if(running||!hasRenderDurableStore())return
 running=true
 try{await withDurableSessionLock('pocket:wallet-event-worker:v1',async()=>{
  const pending=await queryDurablePostgres<{store_key:string;value:WalletEvent}>("select store_key,value from render_durable_kv where store_key like 'pocket:wallet-event:v1:%' and coalesce((value->>'done')::boolean,false)=false and (value->>'nextAt')::numeric <= $1 order by updated_at limit 4",[Date.now()])
  for(const {store_key:key,value:event} of pending.rows){
   try{
    const link=await findPaymentCircleLinkByWallet(event.walletId)
    if(!link||link.circleBlockchain!==event.blockchain)throw Error('Wallet link unavailable.')
    const rows=await verifyWalletEvent(event,link)
    await persistObservedWalletActivity(link.privyUserId,rows)
    await mutateDurableJson<WalletEvent>(key,old=>({...old!,done:true}))
    console.info('[wallet-events]',JSON.stringify({network:link.chain,result:rows.length?'verified':'no-supported-transfer',rows:rows.length}))
   }catch{
    await mutateDurableJson<WalletEvent>(key,old=>({...old!,attempts:(old?.attempts||0)+1,nextAt:Date.now()+Math.min(3600000,30000*2**Math.min(old?.attempts||0,7))}))
    console.warn('[wallet-events] verification pending')
   }
  }
 })}finally{running=false}
}

