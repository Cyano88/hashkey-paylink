import type {PoolClient} from 'pg'
export const developerProjectStoreKey=()=> (process.env.DEVELOPER_PROJECT_STORE_KEY??'hashpaylink:developer-projects:v1').trim()
// New financial records and app removal take the same project-row lock. A request
// authorized before removal cannot commit a new checkout after removal commits.
export async function guardNewProjectRecords(client:Pick<PoolClient,'query'>,source:string,current:unknown,next:unknown){
 const collection=({checkout:'checkouts',funding:'records',agreement:'agreements'} as Record<string,string>)[source]
 if(!collection)return
 const before=(current as any)?.[collection]??{},after=(next as any)?.[collection]??{}
 const ids=[...new Set(Object.entries(after).filter(([id])=>!before[id]).map(([,r])=>(r as any).partnerId).filter(id=>typeof id==='string'&&id.startsWith('dev_')))]
 if(!ids.length)return
 const result=await client.query('select value from render_durable_kv where store_key=$1 for update',[developerProjectStoreKey()])
 const projects=result.rows[0]?.value?.projects??{}
 for(const id of ids)if(projects[id]?.removal)throw Object.assign(Error('This app has been removed and cannot create new payments.'),{status:409})
}
