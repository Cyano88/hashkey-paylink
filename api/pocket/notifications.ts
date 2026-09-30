import type {Request,Response} from 'express'
import {verifiedPrivyUser} from '../local-currency-profile.js'
import {readPocketNotices,markPocketNoticesRead} from './notification-store.js'
import {isPocketInboxNotice} from '../../src/pocket/lib/pocketInboxPolicy.js'
// Bell reads never scan wallets or copy transaction history. Legacy money notices are excluded.
export function createPocketNotificationsHandler(deps={verifyUser:verifiedPrivyUser,read:readPocketNotices,markRead:markPocketNoticesRead}) {
return async function handler(req:Request,res:Response){
 res.setHeader('Cache-Control','private, no-store')
 if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({ok:false})
 try{
  const {userId}=await deps.verifyUser(req)
  if(req.method==='POST'){
   if(req.body?.action!=='mark-read'||!Array.isArray(req.body.ids)||req.body.ids.length>200||!req.body.ids.every((id:unknown)=>typeof id==='string'&&id.length<1000))return res.status(400).json({ok:false})
   await deps.markRead(userId,req.body.ids)
  }
  const notices=(await deps.read(userId)).filter(isPocketInboxNotice)
  return res.json({ok:true,notices,unreadCount:notices.filter(n=>!n.readAt).length})
 }catch(e){const status=(e as {status?:number}).status;return res.status(status===401||status===403?status:503).json({ok:false,error:{message:'Notifications could not refresh.'}})}
}

}
export default createPocketNotificationsHandler()
