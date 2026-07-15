import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import crypto from 'node:crypto'
import { readDurableJson, writeDurableJson } from './render-durable-store.js'

const JOURNAL_PATH = process.env.CIRCLE_POCKET_ACTION_STORE
  ?? (process.env.DATA_PATH ? `${process.env.DATA_PATH}/circle-pocket-actions.json` : './data/circle-pocket-actions.json')
const JOURNAL_STORE_KEY = (process.env.CIRCLE_POCKET_ACTION_STORE_KEY ?? 'hashpaylink:circle-pocket-actions').trim()

export type CirclePocketActionStatus = 'started' | 'completed' | 'failed'
export type CirclePocketActionRecord = {
  id: string
  ownerId: string
  idempotencyKey: string
  action: string
  status: CirclePocketActionStatus
  resourceId?: string
  metadata?: Record<string, string>
  createdAt: number
  updatedAt: number
}

type ActionStore = { actions: Record<string, CirclePocketActionRecord> }
let mutationQueue: Promise<void> = Promise.resolve()

async function readStore(): Promise<ActionStore> {
  try {
    const durable = await readDurableJson<Partial<ActionStore>>(JOURNAL_STORE_KEY)
    if (durable) return { actions: durable.actions ?? {} }
  } catch {
    // File fallback remains available in local and degraded environments.
  }
  try {
    return JSON.parse(await readFile(JOURNAL_PATH, 'utf8')) as ActionStore
  } catch {
    return { actions: {} }
  }
}

async function writeStore(store: ActionStore) {
  await mkdir(dirname(JOURNAL_PATH), { recursive: true })
  await writeFile(JOURNAL_PATH, JSON.stringify(store, null, 2), 'utf8')
  try {
    await writeDurableJson(JOURNAL_STORE_KEY, store)
  } catch {
    // Local file is the fallback; production should configure DATABASE_URL.
  }
}

async function mutate<T>(fn: (store: ActionStore) => T | Promise<T>) {
  let release!: () => void
  const previous = mutationQueue
  mutationQueue = new Promise<void>(resolve => { release = resolve })
  await previous
  try {
    const store = await readStore()
    const result = await fn(store)
    await writeStore(store)
    return result
  } finally {
    release()
  }
}

export async function recordCirclePocketAction(input: {
  ownerId: string
  idempotencyKey: string
  action: string
  status: CirclePocketActionStatus
  resourceId?: string
  metadata?: Record<string, string>
}) {
  return mutate(store => {
    const existing = Object.values(store.actions).find(record => (
      record.ownerId === input.ownerId
      && record.idempotencyKey === input.idempotencyKey
      && record.action === input.action
    ))
    const now = Date.now()
    const record: CirclePocketActionRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      ownerId: input.ownerId,
      idempotencyKey: input.idempotencyKey,
      action: input.action,
      status: input.status,
      resourceId: input.resourceId ?? existing?.resourceId,
      metadata: input.metadata ?? existing?.metadata,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    store.actions[record.id] = record
    return record
  })
}

export async function listCirclePocketActions(ownerId: string, limit = 50) {
  const store = await readStore()
  return Object.values(store.actions)
    .filter(record => record.ownerId === ownerId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.max(1, Math.min(limit, 100)))
}
