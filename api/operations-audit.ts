import type {Request,Response} from 'express'
import {verifyOperationsIdentity} from './operations-access.js'
import {operationsPolicy,operationsRequestPolicy,isOperationsFounder} from './operations-policy.js'
import {readDurableJson} from './render-durable-store.js'
import {readSupportJson} from './hash-support/pocket-storage.js'
import {TEAM_STORE,type TeamStore} from './operations-team-store.js'
import type {OperationsCase} from './operations-cases.js'
type AuditEvent={id:string;source:string;action:string;actor:string;at:string;subject:string;workspace?:string}
type Project={id:string;name:string;businessVerification?:{history?:Array<{action:string;actor:string;at:string}>};operations?:Array<{action:string;actor?:string;actorEmail?:string;at?:string;createdAt?:string}>}
const defaults={verify:verifyOperationsIdentity,env:operationsRequestPolicy,
 team:()=>readDurableJson<TeamStore>(TEAM_STORE),business:()=>readDurableJson<{cases:Record<string,OperationsCase>}>('hashpaylink:business-support:v1'),
 pocket:()=>readSupportJson<{cases:Record<string,OperationsCase>}>((process.env.POCKET_SUPPORT_STORE_KEY||'hashpaylink:pocket-support:v1').trim()),projects:()=>readDurableJson<{projects:Record<string,Project>}>((process.env.DEVELOPER_PROJECT_STORE_KEY||'hashpaylink:developer-projects:v1').trim())}
export function createOperationsAuditHandler(d=defaults){return async(req:Request,res:Response)=>{
 res.setHeader('Cache-Control','private, no-store')
 try{
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Method not allowed.'})
  const identity=await d.verify(req);if(!isOperationsFounder(identity,operationsPolicy(d.env(req))))return res.status(403).json({ok:false,error:'Only an owner can read the combined audit log.'})
  const [team,business,pocket,projects]=await Promise.all([d.team(),d.business(),d.pocket(),d.projects()]);const events:AuditEvent[]=[]
  team?.history.forEach((e,i)=>events.push({id:'team-'+i,source:'Team access',action:e.roles.length?'Access updated':'Access revoked',actor:e.actor,at:e.at,subject:e.email,workspace:e.workspaceId}))
  for(const [source,store]of [['Business support',business],['Pocket support',pocket]] as const)for(const c of Object.values(store?.cases||{}))for(const e of c.caseHistory||[])events.push({id:source+'-'+e.id,source,action:e.action.replace('case-','')+(e.destination?' · '+e.destination:''),actor:e.actor,at:new Date(e.at).toISOString(),subject:c.id,workspace:c.workspaceId||'pocket'})
  for(const p of Object.values(projects?.projects||{})){
   p.businessVerification?.history?.forEach((e,i)=>events.push({id:p.id+'-verification-'+i,source:'Verification',action:e.action,actor:e.actor,at:e.at,subject:p.name}))
   p.operations?.forEach((e,i)=>{const at=e.at||e.createdAt;if(at)events.push({id:p.id+'-operation-'+i,source:'Business operations',action:e.action,actor:e.actorEmail||e.actor||'Recorded operator',at,subject:p.name})})
  }
  return res.json({ok:true,events:events.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,500)})
 }catch(e){const status=(e as {status?:number}).status||503;return res.status(status).json({ok:false,error:status<500?(e as Error).message:'Audit history could not be loaded. Try again.'})}
}}
export default createOperationsAuditHandler()
