import type { PoolClient } from 'pg'
import { mutateDurableJson, queryDurablePostgres, withDurablePostgresTransaction } from './render-durable-store.js'
import { projectActivityChanges, projectActivityKey, projectActivitySnapshots, type JournalSource, type ProjectActivityEvent } from './developer-activity-events.js'

let ready: Promise<unknown> | undefined
export function ensureDeveloperActivitySchema() {
  ready ??= withDurablePostgresTransaction(async client => {
    // Serialize first boot across app instances; IF NOT EXISTS alone can race.
    await client.query("select pg_advisory_xact_lock(hashtext('hashpaylink:developer_activity_events:v1'))")
    await client.query(`create table if not exists developer_activity_events (
    sequence bigserial primary key,
    event_key text not null unique,
    project_id text not null,
    environment text not null check (environment in ('live','test')),
    product text not null check (product in ('checkout','agreement','funding')),
    record_id text not null,
    event text not null,
    occurred_at timestamptz not null,
    recorded_at timestamptz not null default now(),
    details jsonb not null
  );
  create index if not exists developer_activity_project_page on developer_activity_events(project_id,environment,sequence desc);
  create index if not exists developer_activity_record_page on developer_activity_events(project_id,environment,record_id,sequence desc);`)
  }).catch(error=>{ready=undefined;throw error})
  return ready
}

export async function appendDeveloperActivity(client: Pick<PoolClient,'query'>, events: ProjectActivityEvent[]) {
  // Bounded batches, unique stable keys and no update/delete path. Existing entries survive source pruning.
  for (let offset=0;offset<events.length;offset+=250) {
    const batch=events.slice(offset,offset+250).map(event=>({...event,key:projectActivityKey(event)}))
    await client.query(`insert into developer_activity_events(event_key,project_id,environment,product,record_id,event,occurred_at,details)
      select x.key,x."projectId",x.environment,x.product,x."recordId",x.event,x."occurredAt"::timestamptz,x.details
      from jsonb_to_recordset($1::jsonb) as x(key text,"projectId" text,environment text,product text,"recordId" text,event text,"occurredAt" text,details jsonb)
      on conflict(event_key) do nothing`,[JSON.stringify(batch)])
  }
}

export async function mutateWithDeveloperActivity<T>(source:JournalSource,key:string,update:(current:T|undefined)=>T|Promise<T>):Promise<T> {
  await ensureDeveloperActivitySchema()
  return mutateDurableJson<T>(key,update,async(client,current,next)=>{
    await appendDeveloperActivity(client,projectActivityChanges(source,current,next))
  })
}

export type ActivityQuery = {projectId:string;environment:'live'|'test';cursor?:string;limit?:number;recordId?:string}
export function activityQuery(input:ActivityQuery) {
  if (!/^dev_[a-z0-9]{8,64}$/i.test(input.projectId) || !['live','test'].includes(input.environment)) throw Object.assign(new Error('Invalid activity project or environment.'),{status:400})
  if (input.cursor && (!/^[1-9][0-9]{0,18}$/.test(input.cursor)||BigInt(input.cursor)>9223372036854775807n)) throw Object.assign(new Error('Invalid activity cursor.'),{status:400})
  if (input.recordId && !/^[a-zA-Z0-9_-]{1,100}$/.test(input.recordId)) throw Object.assign(new Error('Invalid activity reference.'),{status:400})
  const limit=input.limit??50
  if (!Number.isInteger(limit)||limit<1||limit>100) throw Object.assign(new Error('Activity limit must be between 1 and 100.'),{status:400})
  return {text:`select sequence::text as cursor, event_key as id, project_id as "projectId", environment, product, record_id as "recordId", event,
    occurred_at as "occurredAt", recorded_at as "recordedAt", details
    from developer_activity_events where project_id=$1 and environment=$2
    and ($3::bigint is null or sequence<$3::bigint) and ($4::text is null or record_id=$4)
    order by sequence desc limit $5`,values:[input.projectId,input.environment,input.cursor||null,input.recordId||null,limit+1],limit}
}
export async function listDeveloperActivity(input:ActivityQuery) {
  const query=activityQuery(input)
  await ensureDeveloperActivitySchema()
  const result=await queryDurablePostgres(query.text,query.values)
  const events=result.rows.slice(0,query.limit)
  return {events,nextCursor:result.rows.length>query.limit?events[events.length-1]?.cursor:null,coverage:'Recorded lifecycle observations. Older activity may be incomplete; provider acceptance is not final settlement.'}
}

// Explicit migration only: preserve remaining historical source snapshots without inventing past transitions.
export async function backfillDeveloperActivity(source:JournalSource,key:string) {
  await ensureDeveloperActivitySchema()
  let count=0
  await withDurablePostgresTransaction(async client => {
    // Do not create or rewrite operational stores during backfill.
    const result = await client.query('select value from render_durable_kv where store_key = $1 for update', [key])
    const events=projectActivitySnapshots(source,result.rows[0]?.value)
    count=events.length
    await appendDeveloperActivity(client,events)
  })
  return {source,snapshots:count}
}
