import {createHmac,timingSafeEqual} from 'node:crypto'
import {readDurableJson} from '../render-durable-store.js'
import type {developerPolicyFromStore} from '../developer-projects.js'
import type {MarketplacePrincipal,MarketplaceScope} from './instructions.js'

type Projects=NonNullable<Parameters<typeof developerPolicyFromStore>[0]>
type Access={requests:Array<{projectId:string;ownerId:string;status:string}>}
const scopes:MarketplaceScope[]=['marketplace:read','marketplace:release','marketplace:payout','marketplace:refund']
type Dependencies={readProjects:()=>Promise<Projects|undefined>;readAccess:()=>Promise<Access|undefined>;env:()=>NodeJS.ProcessEnv;now:()=>number}
const defaults:Dependencies={
 readProjects:()=>readDurableJson<Projects>((process.env.DEVELOPER_PROJECT_STORE_KEY??'hashpaylink:developer-projects:v1').trim()),
 readAccess:()=>readDurableJson<Access>('hashpaylink:marketplace-access-requests:v1'),env:()=>process.env,now:Date.now,
}

/** Internal credential adapter only. Does not mount routes or activate settlement.
 * General live keys inherit project authority. Scoped app/CLI keys are deliberately
 * unsupported until marketplace scopes can be issued through their approval flow.
 * Re-read on every instruction, including idempotent retries; never cache approval.
 */
export function createMarketplacePrincipalResolver(overrides:Partial<Dependencies>={}){
 const d={...defaults,...overrides}
 return async(credential:string):Promise<MarketplacePrincipal|null>=>{
  const env=d.env(),secret=(env.DEVELOPER_PORTAL_SECRET??'').trim()
  if(env.MARKETPLACE_INSTRUCTIONS_ENABLED!=='true'||secret.length<32||typeof credential!=='string'||!/^hpl_live_[A-Za-z0-9_-]{16,220}$/.test(credential))return null
  const allowed=(env.MARKETPLACE_PROJECT_IDS??'').split(',').map(v=>v.trim()).filter(Boolean)
  if(!allowed.length||allowed.length>100||allowed.some(id=>!/^dev_[a-z0-9]{8,64}$/i.test(id)))return null
  const digest=createHmac('sha256',secret).update(credential).digest(),now=d.now()
  if(!Number.isFinite(now))return null
  // Read failures propagate to deny the operation, never fall back to permissive state.
  const [store,access]=await Promise.all([d.readProjects(),d.readAccess()])
  const matches=Object.values(store?.projects??{}).flatMap(project=>(project.keys??[]).filter(key=>/^[a-f0-9]{64}$/i.test(key.digest)&&timingSafeEqual(Buffer.from(key.digest,'hex'),digest)).map(key=>({project,key})))
  if(matches.length!==1)return null
  const {project,key}=matches[0]
  if(!allowed.includes(project.id)||!project.ownerId||project.removal||project.operationalStatus!=='active'||project.accountType!=='business'||project.businessVerification?.status!=='approved'||!project.capabilities?.includes('marketplace_payments'))return null
  if(!key.id||key.revokedAt||key.environment!=='live'||!key.prefix.startsWith('hpl_live_')||key.scopes!==undefined||key.createdByGrant||key.expiresAt!==undefined&&(!Number.isFinite(Date.parse(key.expiresAt))||Date.parse(key.expiresAt)<=now))return null
  const requests=(access?.requests??[]).filter(r=>r.projectId===project.id&&r.ownerId===project.ownerId)
  if(requests.length!==1||requests[0].status!=='approved')return null
  return {projectId:project.id,credentialId:key.id,active:true,capabilities:['marketplace_payments'],scopes:[...scopes]}
 }
}
