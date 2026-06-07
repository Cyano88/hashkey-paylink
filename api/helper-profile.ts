import type { Request, Response } from 'express'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import crypto from 'node:crypto'
import { archivePayment, type ArchiveResult } from './og-storage.js'

const STORE_PATH = process.env.HELPER_PROFILE_STORE
  ?? (process.env.DATA_PATH ? `${process.env.DATA_PATH}/helper-profiles.json` : './data/helper-profiles.json')
const UPSTASH_REST_URL = (process.env.UPSTASH_REDIS_REST_URL ?? '').trim().replace(/\/+$/, '')
const UPSTASH_REST_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN ?? '').trim()
const UPSTASH_STORE_KEY = (process.env.HELPER_PROFILE_STORE_KEY ?? 'hashpaylink:helper-profiles').trim()

type HelperMemoryProof = ArchiveResult & {
  ogExplorer: string
  archivedAt: number
}

type HelperProfile = {
  id: string
  payer: string
  displayName: string
  telegramHandle?: string
  accessEventId?: string
  preferences?: string[]
  memorySummary?: string
  memoryProof?: HelperMemoryProof
  createdAt: number
  updatedAt: number
}

type Store = {
  profiles: Record<string, HelperProfile>
}

function cleanString(value: unknown, max = 256) {
  return String(value ?? '').trim().slice(0, max)
}

function normalizePayer(value: unknown) {
  return cleanString(value, 128)
}

function profileId(payer: string) {
  return crypto.createHash('sha256').update(payer.toLowerCase()).digest('hex').slice(0, 32)
}

function cleanList(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map(item => cleanString(item, 80)).filter(Boolean).slice(0, 12)
}

async function upstashCommand<T>(command: unknown[]): Promise<T | undefined> {
  if (!UPSTASH_REST_URL || !UPSTASH_REST_TOKEN) return undefined
  const response = await fetch(UPSTASH_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  })
  if (!response.ok) throw new Error(`Upstash request failed: ${response.status}`)
  const data = await response.json() as { result?: T }
  return data.result
}

async function readStore(): Promise<Store> {
  try {
    const remote = await upstashCommand<string>(['GET', UPSTASH_STORE_KEY])
    if (remote) return JSON.parse(remote) as Store
  } catch (err) {
    console.warn('[helper-profile] Upstash load failed; using file fallback.', err instanceof Error ? err.message : String(err))
  }

  try {
    return JSON.parse(await readFile(STORE_PATH, 'utf8')) as Store
  } catch {
    return { profiles: {} }
  }
}

async function writeStore(store: Store) {
  await mkdir(dirname(STORE_PATH), { recursive: true })
  const serialized = JSON.stringify(store, null, 2)
  await writeFile(STORE_PATH, serialized, 'utf8')
  try {
    await upstashCommand(['SET', UPSTASH_STORE_KEY, JSON.stringify(store)])
  } catch (err) {
    console.warn('[helper-profile] Upstash save failed; file fallback saved.', err instanceof Error ? err.message : String(err))
  }
}

function publicProfile(profile: HelperProfile | undefined) {
  return profile ?? null
}

async function checkpointMemory(profile: HelperProfile) {
  const ts = Date.now()
  const memoryHash = crypto.createHash('sha256').update(JSON.stringify({
    payer: profile.payer,
    displayName: profile.displayName,
    preferences: profile.preferences ?? [],
    memorySummary: profile.memorySummary ?? '',
    ts,
  })).digest('hex')

  const result = await archivePayment({
    eventId: `helper-memory-${profile.id}-${ts.toString(36)}`,
    txHash: `memory_${memoryHash}`,
    chain: '0G Memory',
    payer: profile.displayName || profile.payer,
    amount: '0',
    ts,
    source: 'helper-memory',
    metadata: {
      type: 'hashpaylink_helper_memory_checkpoint',
      profileId: profile.id,
      payerHash: profile.id,
      displayName: profile.displayName,
      preferences: profile.preferences ?? [],
      memorySummary: profile.memorySummary ?? '',
      memoryHash,
    },
  })

  if (!result) return undefined
  return {
    ...result,
    ogExplorer: `https://chainscan.0g.ai/tx/${result.ogTxHash}`,
    archivedAt: ts,
  }
}

export default async function handler(req: Request, res: Response) {
  if (req.method === 'GET') {
    const payer = normalizePayer(req.query.payer)
    if (!payer) return res.status(400).json({ ok: false, error: 'Missing payer.' })
    const store = await readStore()
    return res.json({ ok: true, profile: publicProfile(store.profiles[profileId(payer)]) })
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const action = cleanString(req.body?.action, 32) || 'save'
  const payer = normalizePayer(req.body?.payer)
  if (!payer) return res.status(400).json({ ok: false, error: 'Missing payer.' })

  const store = await readStore()
  const id = profileId(payer)
  const existing = store.profiles[id]
  const now = Date.now()

  const next: HelperProfile = {
    id,
    payer,
    displayName: cleanString(req.body?.displayName, 80) || existing?.displayName || payer,
    telegramHandle: cleanString(req.body?.telegramHandle, 80) || existing?.telegramHandle,
    accessEventId: cleanString(req.body?.accessEventId, 128) || existing?.accessEventId,
    preferences: cleanList(req.body?.preferences).length ? cleanList(req.body?.preferences) : existing?.preferences ?? [],
    memorySummary: cleanString(req.body?.memorySummary, 1600) || existing?.memorySummary || '',
    memoryProof: existing?.memoryProof,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  if (action === 'checkpoint') {
    const proof = await checkpointMemory(next)
    if (proof) next.memoryProof = proof
  }

  store.profiles[id] = next
  await writeStore(store)
  return res.json({ ok: true, profile: publicProfile(next), checkpointed: action === 'checkpoint' && !!next.memoryProof })
}
