import {createHash} from 'node:crypto'
import {readDurableJson, mutateDurableJson, hasRenderDurableStore} from './render-durable-store.js'
import {operationsPolicy, setOperationsRequestPolicy, type OperationsRole} from './operations-policy.js'
export const TEAM_STORE='hashpaylink:operations-team:v1'
export type TeamGrant={email:string;workspaceId:string;roles:OperationsRole[];updatedAt:string;updatedBy:string}
export type TeamStore={overrides:Record<string,TeamGrant>;history:Array<{email:string;workspaceId:string;roles:OperationsRole[];actor:string;at:string}>}
export function teamKey(email:string,workspace:string){return createHash('sha256').update(email.toLowerCase()+'\n'+workspace).digest('hex')}
export function mergeOperationsTeam(env:NodeJS.ProcessEnv,store?:TeamStore):NodeJS.ProcessEnv {
  const baseline=operationsPolicy(env)
  const overrides=store?.overrides??{}
  const grants=[...baseline.grants.filter(g=>!overrides[teamKey(g.email,g.workspaceId)]),...Object.values(overrides).filter(g=>g.roles.length).map(({email,workspaceId,roles})=>({email,workspaceId,roles}))]
  const merged={...env,OPERATIONS_GRANTS_JSON:JSON.stringify(grants)}
  operationsPolicy(merged)
  return merged
}
export async function loadOperationsTeam(req:object,dependencies={hasStore:hasRenderDurableStore,read:()=>readDurableJson<TeamStore>(TEAM_STORE)}) {
  // Never fall back to old environment grants when the revocation store is unavailable.
  if(!dependencies.hasStore())throw Object.assign(Error('Team access storage is unavailable.'),{status:503})
  const env=mergeOperationsTeam(process.env,await dependencies.read())
  setOperationsRequestPolicy(req,env)
  return env
}
export async function saveOperationsGrant(grant:TeamGrant,actor:string){
  return mutateDurableJson<TeamStore>(TEAM_STORE,current=>({overrides:{...current?.overrides,[teamKey(grant.email,grant.workspaceId)]:grant},
    history:[...(current?.history??[]),{email:grant.email,workspaceId:grant.workspaceId,roles:grant.roles,actor,at:grant.updatedAt}]}))
}
