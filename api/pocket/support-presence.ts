import type {Request,Response} from 'express'
import {resolveCirclePocketIdentity,circlePocketIdentityId,circlePocketIdentityErrorStatus} from '../circle-pocket-identity.js'
import {verifyOperationsSection} from '../operations-access.js'
import {readSupportJson} from '../hash-support/pocket-storage.js'
import {supportPresence} from '../support-presence.js'
type Case={id:string;profileId:string;status:string;humanSupport?:boolean;assignedTo?:string;category?:string}
const defaults={identity:resolveCirclePocketIdentity,staff:(req:Request)=>verifyOperationsSection(req,'support'),read:()=>readSupportJson<{cases:Record<string,Case>}>((process.env.POCKET_SUPPORT_STORE_KEY||'hashpaylink:pocket-support:v1').trim()),presence:supportPresence,now:Date.now}
export function createPocketSupportPresenceHandler(overrides:Partial<typeof defaults>={}){const d={...defaults,...overrides};return async(req:Request,res:Response)=>{
 res.setHeader('Cache-Control','private, no-store')
 try{
  const action=req.body?.action,staff=action==='staff-presence'||action==='staff-typing',write=action==='typing'||action==='staff-typing'
  if(req.method!=='POST'||!['presence','typing','staff-presence','staff-typing'].includes(action))return res.status(400).json({ok:false,error:'Choose a supported action.'})
  let profileId:string|undefined
  if(staff){await d.staff(req);if(req.query.workspace!=='pocket')throw Object.assign(Error('Select Pocket support.'),{status:403})}
  else{const identity=await d.identity(req);if(identity.kind!=='privy')throw Object.assign(Error('Sign in to Pocket.'),{status:401});profileId=circlePocketIdentityId(identity)}
  const id=typeof req.body.caseId==='string'?req.body.caseId:'',c=(await d.read())?.cases[id]
  if(!c||(!staff&&c.profileId!==profileId))return res.status(404).json({ok:false,error:'Conversation not found.'})
  const enabled=c.status!=='resolved'&&(c.humanSupport!==false||Boolean(c.assignedTo)||c.category!=='other')
  if(!write)return res.json({ok:true,...(enabled?await d.presence.read('pocket:'+id,staff?'user':'staff',d.now()):{expiresIn:0})})
  if(typeof req.body.typing!=='boolean')return res.status(400).json({ok:false,error:'Invalid typing state.'})
  if(!enabled)return res.status(409).json({ok:false,error:'This conversation is not waiting for support.'})
  await d.presence.set('pocket:'+id,staff?'staff':'user',req.body.typing,d.now());return res.json({ok:true})
 }catch(e){const status=(e as {status?:number}).status||circlePocketIdentityErrorStatus(e,503);return res.status(status).json({ok:false,error:status<500?(e as Error).message:'Support presence is unavailable.'})}
}}
export default createPocketSupportPresenceHandler()
