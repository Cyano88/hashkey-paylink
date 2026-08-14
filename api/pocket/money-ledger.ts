import crypto from 'node:crypto'
import { hasRenderDurableStore, queryDurablePostgres } from '../render-durable-store.js'

export type PocketMoneyRail = 'bank_payout' | 'bill_payment' | 'pos_settlement' | 'wallet_bridge' | 'wallet_transfer' | 'hosted_checkout' | 'service_funding'
export type PocketMoneyLedgerInput = {
  eventKey?: string; ownerId: string; executionId: string; rail: PocketMoneyRail; state: string; asset: 'USDC'; amount: string
  sourceNetwork: string; settlementNetwork: string; resourceId?: string; providerReference?: string; transactionHash?: string
  failureCode?: string; metadata: Record<string, string>; recordedAt?: number
}
export type PocketMoneyLedgerEvent = PocketMoneyLedgerInput & { id: string; eventKey: string; recordedAt: number }

const IS_RENDER = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL)
const localEvents = new Map<string, PocketMoneyLedgerEvent>()
let schemaReady: Promise<unknown> | undefined
const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

async function ensureSchema() {
  schemaReady ??= queryDurablePostgres(`
    create table if not exists pocket_money_ledger (
      id text primary key,
      event_key text not null unique,
      owner_id text not null,
      execution_id text not null,
      rail text not null,
      state text not null,
      asset text not null,
      amount text not null,
      source_network text not null,
      settlement_network text not null,
      resource_id text,
      provider_reference text,
      transaction_hash text,
      failure_code text,
      metadata jsonb not null default '{}'::jsonb,
      recorded_at bigint not null
    );
    create index if not exists pocket_money_ledger_owner_cursor_idx on pocket_money_ledger (owner_id, recorded_at desc, id desc);
    create index if not exists pocket_money_ledger_execution_idx on pocket_money_ledger (execution_id, recorded_at asc);
  `)
  await schemaReady
}

function normalized(input: PocketMoneyLedgerInput): PocketMoneyLedgerEvent {
  const recordedAt = input.recordedAt ?? Date.now()
  const eventKey = clean(input.eventKey || `${input.executionId}:${input.state}:${recordedAt}`, 240)
  return { ...input, id: `pmle_${crypto.createHash('sha256').update(eventKey).digest('hex').slice(0, 32)}`, eventKey, recordedAt, metadata: Object.fromEntries(Object.entries(input.metadata ?? {}).map(([key, value]) => [clean(key, 60), clean(value, 240)]).filter(([key]) => key)) }
}

export async function appendPocketMoneyLedgerEvent(input: PocketMoneyLedgerInput) {
  const event = normalized(input)
  if (!hasRenderDurableStore()) {
    if (IS_RENDER) throw new Error('Durable Pocket money ledger storage is not configured.')
    const existing = localEvents.get(event.eventKey)
    if (existing) return existing
    localEvents.set(event.eventKey, event)
    return event
  }
  await ensureSchema()
  await queryDurablePostgres(
    `insert into pocket_money_ledger (id,event_key,owner_id,execution_id,rail,state,asset,amount,source_network,settlement_network,resource_id,provider_reference,transaction_hash,failure_code,metadata,recorded_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16) on conflict (event_key) do nothing`,
    [event.id,event.eventKey,event.ownerId,event.executionId,event.rail,event.state,event.asset,event.amount,event.sourceNetwork,event.settlementNetwork,event.resourceId || null,event.providerReference || null,event.transactionHash || null,event.failureCode || null,JSON.stringify(event.metadata),event.recordedAt],
  )
  return event
}

export async function listPocketMoneyLedgerEvents(input: { ownerId: string; cursor?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(Math.trunc(input.limit ?? 50), 100))
  let beforeTime = Number.MAX_SAFE_INTEGER
  let beforeId = '~'
  if (input.cursor) {
    try {
      const cursor = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')) as { recordedAt?: unknown; id?: unknown }
      if (!Number.isSafeInteger(cursor.recordedAt) || typeof cursor.id !== 'string' || !cursor.id) throw new Error()
      beforeTime = Number(cursor.recordedAt)
      beforeId = cursor.id
    } catch {
      throw Object.assign(new Error('Pocket ledger cursor is invalid.'), { status: 400 })
    }
  }
  if (!hasRenderDurableStore()) {
    if (IS_RENDER) throw new Error('Durable Pocket money ledger storage is not configured.')
    const rows = [...localEvents.values()].filter(event => event.ownerId === input.ownerId && (event.recordedAt < beforeTime || (event.recordedAt === beforeTime && event.id < beforeId))).sort((a,b) => b.recordedAt-a.recordedAt || b.id.localeCompare(a.id))
    const events = rows.slice(0, limit), last = events.at(-1), nextCursor = rows.length > limit && last ? Buffer.from(JSON.stringify({ recordedAt: last.recordedAt, id: last.id })).toString('base64url') : undefined
    return { events, nextCursor }
  }
  await ensureSchema()
  const result = await queryDurablePostgres(`select id,event_key,owner_id,execution_id,rail,state,asset,amount,source_network,settlement_network,resource_id,provider_reference,transaction_hash,failure_code,metadata,recorded_at from pocket_money_ledger where owner_id=$1 and (recorded_at<$2 or (recorded_at=$2 and id<$3)) order by recorded_at desc,id desc limit $4`, [input.ownerId,beforeTime,beforeId,limit+1])
  const rows = result.rows.map((row: any) => ({ id: row.id,eventKey:row.event_key,ownerId:row.owner_id,executionId:row.execution_id,rail:row.rail,state:row.state,asset:row.asset,amount:row.amount,sourceNetwork:row.source_network,settlementNetwork:row.settlement_network,resourceId:row.resource_id||undefined,providerReference:row.provider_reference||undefined,transactionHash:row.transaction_hash||undefined,failureCode:row.failure_code||undefined,metadata:row.metadata??{},recordedAt:Number(row.recorded_at) })) as PocketMoneyLedgerEvent[]
  const events = rows.slice(0,limit), last = events.at(-1), nextCursor = rows.length>limit && last ? Buffer.from(JSON.stringify({ recordedAt: last.recordedAt, id: last.id })).toString('base64url') : undefined
  return { events, nextCursor }
}
