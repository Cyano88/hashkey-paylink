// Process-local coalescing and concurrency cap. Authentication and hourly history
// budgets are enforced by the caller; keys must be built from the verified owner.
const pending=new Map<string,Promise<unknown>>()
const recent=new Map<string,{until:number;value:unknown}>()
export async function boundedSupportRead<T>(key:string,work:()=>Promise<T>):Promise<T>{
 const cached=recent.get(key);if(cached&&cached.until>Date.now())return cached.value as T
 const existing=pending.get(key);if(existing)return existing as Promise<T>
 if(pending.size>=8)throw Error('Support live checks are busy.')
 const task=Promise.resolve().then(work).then(value=>{recent.set(key,{until:Date.now()+20000,value});if(recent.size>128){for(const[k,v]of recent)if(v.until<Date.now())recent.delete(k);while(recent.size>128)recent.delete(recent.keys().next().value!)}return value}).finally(()=>pending.delete(key))
 pending.set(key,task);return task
}
