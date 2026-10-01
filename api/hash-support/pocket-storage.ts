import {mutateDurableJson,readDurableJson} from '../render-durable-store.js'

type Marker = {__hashSupportRemote: true; migratedAt: string; workspaceId: string}
const isMarker=(value:unknown):value is Marker=>Boolean(value && typeof value==='object' && (value as Marker).__hashSupportRemote===true)
const unavailable=()=>Object.assign(new Error('Support is temporarily unavailable. Please try again.'),{status:503})
async function remote(method='GET',data?:unknown,workspaceId?:string):Promise<{revision:number;value?:unknown;workspaceId:string}> {
 const endpoint=(process.env.HASH_SUPPORT_URL||'').trim(), key=(process.env.HASH_SUPPORT_API_KEY||'').trim()
 if(!endpoint||!key)throw unavailable()
 const url=new URL(endpoint)
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw unavailable()
 try {
  const response=await fetch(new URL('/v1/integration-state',url),{method,redirect:'error',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(10000)})
  if(response.status===409)throw Object.assign(new Error('Support was updated. Please try again.'),{status:409})
  if(!response.ok)throw unavailable()
  const result=await response.json()
  if(!result.ok||!Number.isSafeInteger(result.revision)||typeof result.workspaceId!=='string'||(workspaceId&&result.workspaceId!==workspaceId))throw unavailable()
  return result
 }catch(error){if((error as {status?:number})?.status===409)throw error;throw unavailable()}
}
// Pocket retains authorization/lifecycle semantics. Only its trusted backend holds the business key.
// The original durable lock serializes migration, rollback and ongoing mutations across instances.
export async function readSupportJson<T>(key:string):Promise<T|undefined>{
 const local=await readDurableJson<T|Marker>(key)
 if(!isMarker(local))return local as T|undefined
 const snapshot=await remote('GET',undefined,local.workspaceId)
 if(!snapshot.value)throw unavailable()
 return snapshot.value as T
}
export async function mutateSupportJson<T>(key:string,update:(current:T|undefined)=>T|Promise<T>):Promise<T>{
 let result:T
 await mutateDurableJson<T|Marker>(key,async local=>{
  if(!isMarker(local)){result=await update(local as T|undefined);return result}
  const snapshot=await remote('GET',undefined,local.workspaceId)
  if(!snapshot.value)throw unavailable()
  result=await update(snapshot.value as T)
  await remote('PUT',{revision:snapshot.revision,value:result},local.workspaceId)
  return local
 })
 return result!
}
export async function migrateSupportStorage(key:string,rollback=false){
 let migrated=false
 await mutateDurableJson<unknown>(key,async local=>{
  if(rollback){
   if(!isMarker(local))return local||{cases:{}}
   const snapshot=await remote('GET',undefined,local.workspaceId);if(!snapshot.value)throw unavailable()
   migrated=true;return snapshot.value
  }
  if(isMarker(local))return local
  const value=local||{cases:{}},snapshot=await remote()
  // Never replace an existing standalone workspace with a different Pocket dataset.
  if(snapshot.revision!==0&&canonical(snapshot.value)!==canonical(value))throw Object.assign(new Error('Hash already contains support data. Reconcile it before migration.'),{status:409})
  if(snapshot.revision===0)await remote('PUT',{revision:0,value},snapshot.workspaceId)
  const verified=await remote('GET',undefined,snapshot.workspaceId)
  if(JSON.stringify(verified.value)!==JSON.stringify(value)) {
   // PostgreSQL JSONB changes key ordering; compare recursively in canonical order.
   if(canonical(verified.value)!==canonical(value))throw unavailable()
  }
  migrated=true
  return {__hashSupportRemote:true,migratedAt:new Date().toISOString(),workspaceId:verified.workspaceId} satisfies Marker
 })
 return {changed:migrated,mode:rollback?'pocket':'hash'}
}
function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']'
 if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}'
 return JSON.stringify(value)
}
