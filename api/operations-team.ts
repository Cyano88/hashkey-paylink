import type {Request,Response} from 'express'
import {verifyOperationsIdentity} from './operations-access.js'
import {isOperationsFounder,operationsPolicy,operationsRequestPolicy,OPERATIONS_ROLES,workspaceProjectIds} from './operations-policy.js'
import {saveOperationsGrant,TEAM_STORE,type TeamStore} from './operations-team-store.js'
import {readDurableJson} from './render-durable-store.js'

export function createOperationsTeamHandler(dependencies={verify:verifyOperationsIdentity,env:operationsRequestPolicy,read:()=>readDurableJson<TeamStore>(TEAM_STORE),save:saveOperationsGrant}) {
return async function operationsTeam(req:Request,res:Response){
  res.setHeader('Cache-Control','no-store')
  try{
    const identity=await dependencies.verify(req)
    const env=dependencies.env(req),policy=operationsPolicy(env)
    if(!isOperationsFounder(identity,policy))return res.status(403).json({ok:false,error:'Only an owner can manage team access.'})
    if(req.method==='GET'){
      const store=await dependencies.read()
      return res.json({ok:true,grants:policy.grants,owners:[...policy.founders],history:(store?.history??[]).slice(-100).reverse()})
    }
    if(req.method!=='PUT')return res.status(405).json({ok:false,error:'Method not allowed.'})
    const email=String(req.body?.email??'').trim().toLowerCase(),workspaceId=String(req.body?.workspaceId??'')
    const roles=req.body?.roles
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!Array.isArray(roles)||roles.some(r=>!OPERATIONS_ROLES.includes(r))||new Set(roles).size!==roles.length)return res.status(400).json({ok:false,error:'Choose a valid email and team roles.'})
    if(policy.founders.has(email))return res.status(409).json({ok:false,error:'Owner access is managed separately from staff roles.'})
    workspaceProjectIds(workspaceId,policy)
    // Prevent role assignments which would grant no access to the selected product.
    if(workspaceId==='pocket'&&roles.includes('compliance') || workspaceId!=='pocket'&&roles.includes('support'))return res.status(400).json({ok:false,error:'This role is not available in the selected workspace yet.'})
    await dependencies.save({email,workspaceId,roles,updatedAt:new Date().toISOString(),updatedBy:identity.userId},identity.email)
    return res.json({ok:true})
  }catch(e){const status=(e as {status?:number}).status??503;return res.status(status).json({ok:false,error:status<500?(e as Error).message:'Team access is temporarily unavailable.'})}
}

}
export default createOperationsTeamHandler()
