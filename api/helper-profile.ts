import type { Request, Response } from 'express'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import crypto from 'node:crypto'
import pg from 'pg'
import { archivePayment, type ArchiveResult } from './og-storage.js'
import { readDurableJson, writeDurableJson } from './render-durable-store.js'

const { Pool } = pg
const DATABASE_URL = (process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim()
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
    })
  : null

const STORE_PATH = process.env.HELPER_PROFILE_STORE
  ?? (process.env.DATA_PATH ? `${process.env.DATA_PATH}/helper-profiles.json` : './data/helper-profiles.json')
const HELPER_PROFILE_STORE_KEY = (process.env.HELPER_PROFILE_STORE_KEY ?? 'hashpaylink:helper-profiles').trim()

type HelperMemoryProof = ArchiveResult & {
  ogExplorer: string
  archivedAt: number
}

type HelperProfile = {
  id: string
  payer: string
  displayName: string
  ownerKey?: string
  accessPayer?: string
  telegramHandle?: string
  accessEventId?: string
  preferredPaymentWallet?: string
  preferredPaymentNetwork?: string
  preferredPaymentEvmWallet?: string
  preferredPaymentSolanaWallet?: string
  preferences?: string[]
  memorySummary?: string
  memoryProof?: HelperMemoryProof
  helperThread?: HelperThreadMessage[]
  createdAt: number
  updatedAt: number
}

type Store = {
  profiles: Record<string, HelperProfile>
}

type HelperThreadMessage = {
  id: string
  mode?: string
  subMode?: string
  question?: string
  answer: string
  paylink?: StoredPaylink
  actionLinks?: Array<{ label: string; url: string }>
  receiptId?: string
  txHash?: string
  createdAt: number
}

type StoredPaylink = {
  id?: string
  eventId?: string
  kind?: 'payment-request' | 'polymarket-funding'
  mode: string
  wallet: string
  network?: string
  evmWallet?: string
  solanaWallet?: string
  polymarketWallet?: string
  label: string
  target: string
  amount: string
  payUrl?: string
  dashboardUrl?: string
}

let pgSchemaReady: Promise<void> | null = null

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

function cleanActionLinks(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map(item => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const label = cleanString(record.label, 40)
    const url = cleanString(record.url, 500)
    if (!label || !url || !/^\/|^https?:\/\//i.test(url)) return null
    return { label, url }
  }).filter(Boolean).slice(0, 4) as Array<{ label: string; url: string }>
}

function cleanPaylink(value: unknown): StoredPaylink | undefined {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : null
  if (!record) return undefined
  const mode = cleanString(record.mode, 24)
  const wallet = cleanString(record.wallet, 120)
  const label = cleanString(record.label, 160)
  const target = cleanString(record.target, 120)
  const amount = cleanString(record.amount, 40)
  if (!mode || !wallet || !label || !target) return undefined
  const kind = cleanString(record.kind, 40)
  const payUrl = cleanString(record.payUrl, 500)
  const dashboardUrl = cleanString(record.dashboardUrl, 500)
  return {
    id: cleanString(record.id, 120) || undefined,
    eventId: cleanString(record.eventId, 120) || undefined,
    kind: kind === 'polymarket-funding' ? 'polymarket-funding' : kind === 'payment-request' ? 'payment-request' : undefined,
    mode,
    wallet,
    network: cleanString(record.network, 24) || undefined,
    evmWallet: cleanString(record.evmWallet, 120) || undefined,
    solanaWallet: cleanString(record.solanaWallet, 120) || undefined,
    polymarketWallet: cleanString(record.polymarketWallet, 120) || undefined,
    label,
    target,
    amount,
    payUrl: payUrl && /^\/|^https?:\/\//i.test(payUrl) ? payUrl : undefined,
    dashboardUrl: dashboardUrl && /^\/|^https?:\/\//i.test(dashboardUrl) ? dashboardUrl : undefined,
  }
}

function cleanThreadId(value: unknown, fallback: string) {
  const id = cleanString(value, 80).replace(/[^a-zA-Z0-9:_-]/g, '')
  return id || fallback
}

function normalizeThreadMessage(row: Record<string, unknown>): HelperThreadMessage {
  return {
    id: cleanString(row.id, 80),
    mode: cleanString(row.mode, 40) || undefined,
    subMode: cleanString(row.sub_mode, 40) || undefined,
    question: cleanString(row.question, 500) || undefined,
    answer: cleanString(row.answer, 2000),
    paylink: cleanPaylink(row.paylink),
    actionLinks: cleanActionLinks(row.action_links),
    receiptId: cleanString(row.receipt_id, 120) || undefined,
    txHash: cleanString(row.tx_hash, 120) || undefined,
    createdAt: Number(row.created_at) || Date.now(),
  }
}

function compactMemoryText(value: string, max = 180) {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function inferTopics(text: string) {
  const value = text.toLowerCase()
  return [
    value.includes('polymarket') && 'Polymarket',
    value.includes('stream') && 'HashpayStream',
    value.includes('agent') && 'agent setup',
    value.includes('wallet') && 'wallets',
    value.includes('base') && 'Base',
    value.includes('arc') && 'Arc',
    value.includes('circle') && 'Circle',
    value.includes('0g') && '0G proofs',
    value.includes('payment') && 'payments',
  ].filter(Boolean) as string[]
}

function deriveMemorySummary(input: {
  existing?: string
  displayName: string
  question?: string
  answer?: string
}) {
  const base = input.existing?.trim()
    || `Prefers to be called ${input.displayName}. Uses Hash PayLink Agent Helper for payments, Polymarket funding, HashpayStream, planning, and agent setup.`
  const question = compactMemoryText(input.question ?? '', 120)
  if (!question) return base.slice(0, 1600)

  const topics = inferTopics(`${input.question ?? ''}\n${input.answer ?? ''}`).join(', ')
  const answerHint = compactMemoryText((input.answer ?? '').split('\n').find(line => line.trim().length > 40) ?? '', 120)
  const note = `Recent need: ${question}${topics ? ` (${topics})` : ''}.`
  const updated = answerHint ? `${base}\n${note} Helpful framing: ${answerHint}` : `${base}\n${note}`
  const uniqueLines = Array.from(new Set(updated.split('\n').map(line => line.trim()).filter(Boolean)))
  return uniqueLines.slice(-8).join('\n').slice(-1600)
}

async function readStore(): Promise<Store> {
  try {
    const remote = await readDurableJson<Partial<Store>>(HELPER_PROFILE_STORE_KEY)
    if (remote) return { profiles: remote.profiles ?? {} }
  } catch (err) {
    console.warn('[helper-profile] durable load failed; using file fallback.', err instanceof Error ? err.message : String(err))
  }

  try {
    return JSON.parse(await readFile(STORE_PATH, 'utf8')) as Store
  } catch {
    return { profiles: {} }
  }
}

async function ensurePgSchema() {
  if (!pool) return
  pgSchemaReady ??= pool.query(`
    create table if not exists helper_profiles (
      id text primary key,
      profile jsonb not null,
      created_at bigint not null,
      updated_at bigint not null
    );
    create table if not exists helper_thread_messages (
      profile_id text not null references helper_profiles(id) on delete cascade,
      thread_id text not null,
      id text not null,
      mode text,
      sub_mode text,
      question text,
      answer text not null,
      paylink jsonb,
      action_links jsonb not null default '[]'::jsonb,
      receipt_id text,
      tx_hash text,
      created_at bigint not null,
      primary key (profile_id, thread_id, id)
    );
    alter table helper_thread_messages
      add column if not exists paylink jsonb;
    create index if not exists helper_thread_messages_profile_created_idx
      on helper_thread_messages(profile_id, created_at desc);
  `).then(() => undefined)
  await pgSchemaReady
}

function profileWithoutThread(profile: HelperProfile): HelperProfile {
  const { helperThread: _helperThread, ...rest } = profile
  return rest
}

async function readPgProfile(id: string, threadId?: string): Promise<HelperProfile | undefined> {
  if (!pool) return undefined
  await ensurePgSchema()
  const profileRow = await pool.query('select profile from helper_profiles where id = $1 limit 1', [id])
  if (!profileRow.rowCount) return undefined
  const profile = profileRow.rows[0].profile as HelperProfile
  const messageRows = threadId
    ? await pool.query(
        `select * from helper_thread_messages
          where profile_id = $1 and thread_id = $2
          order by created_at desc
          limit 80`,
        [id, threadId],
      )
    : await pool.query(
        `select * from helper_thread_messages
          where profile_id = $1
          order by created_at desc
          limit 80`,
        [id],
      )
  return {
    ...profile,
    helperThread: messageRows.rows.reverse().map(row => normalizeThreadMessage(row)),
  }
}

async function writePgProfile(profile: HelperProfile) {
  if (!pool) return
  await ensurePgSchema()
  const stored = profileWithoutThread(profile)
  await pool.query(
    `insert into helper_profiles (id, profile, created_at, updated_at)
      values ($1, $2::jsonb, $3, $4)
      on conflict (id) do update set profile = excluded.profile, updated_at = excluded.updated_at`,
    [profile.id, JSON.stringify(stored), stored.createdAt, stored.updatedAt],
  )
}

async function appendPgThreadMessage(profileId: string, threadId: string, message: HelperThreadMessage) {
  if (!pool) return
  await ensurePgSchema()
  await pool.query(
    `insert into helper_thread_messages
      (profile_id, thread_id, id, mode, sub_mode, question, answer, paylink, action_links, receipt_id, tx_hash, created_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12)
      on conflict (profile_id, thread_id, id) do update set
        mode = excluded.mode,
        sub_mode = excluded.sub_mode,
        question = excluded.question,
        answer = excluded.answer,
        paylink = excluded.paylink,
        action_links = excluded.action_links,
        receipt_id = excluded.receipt_id,
        tx_hash = excluded.tx_hash,
        created_at = excluded.created_at`,
    [
      profileId,
      threadId,
      message.id,
      message.mode || null,
      message.subMode || null,
      message.question || null,
      message.answer,
      message.paylink ? JSON.stringify(message.paylink) : null,
      JSON.stringify(message.actionLinks ?? []),
      message.receiptId || null,
      message.txHash || null,
      message.createdAt,
    ],
  )
  await pool.query(
    `delete from helper_thread_messages
      where profile_id = $1 and ctid not in (
        select ctid from helper_thread_messages
        where profile_id = $1
        order by created_at desc
        limit 160
      )`,
    [profileId],
  )
}

async function clearPgThread(profileId: string, threadId?: string) {
  if (!pool) return
  await ensurePgSchema()
  if (threadId) {
    await pool.query('delete from helper_thread_messages where profile_id = $1 and thread_id = $2', [profileId, threadId])
    return
  }
  await pool.query('delete from helper_thread_messages where profile_id = $1', [profileId])
}

async function writeStore(store: Store) {
  await mkdir(dirname(STORE_PATH), { recursive: true })
  const serialized = JSON.stringify(store, null, 2)
  await writeFile(STORE_PATH, serialized, 'utf8')
  try {
    await writeDurableJson(HELPER_PROFILE_STORE_KEY, store)
  } catch (err) {
    console.warn('[helper-profile] durable save failed; file fallback saved.', err instanceof Error ? err.message : String(err))
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
    const ownerKey = normalizePayer(req.query.owner ?? req.query.ownerKey)
    const fallbackOwner = normalizePayer(req.query.fallbackOwner)
    const threadId = cleanString(req.query.threadId, 80) || undefined
    if (!payer && !ownerKey) return res.status(400).json({ ok: false, error: 'Missing payer.' })
    const ownerProfile = ownerKey
      ? pool ? await readPgProfile(profileId(ownerKey), threadId) : undefined
      : undefined
    const payerProfile = payer
      ? pool ? await readPgProfile(profileId(payer), threadId) : undefined
      : undefined
    const fallbackProfile = fallbackOwner
      ? pool ? await readPgProfile(profileId(fallbackOwner), threadId) : undefined
      : undefined
    if (pool) {
      const pgProfile = ownerProfile ?? payerProfile ?? fallbackProfile
      if (pgProfile) return res.json({ ok: true, profile: publicProfile(pgProfile) })
      const legacyStore = await readStore()
      const legacyProfile =
        (ownerKey ? legacyStore.profiles[profileId(ownerKey)] : undefined)
        ?? (payer ? legacyStore.profiles[profileId(payer)] : undefined)
        ?? (fallbackOwner ? legacyStore.profiles[profileId(fallbackOwner)] : undefined)
      if (legacyProfile) {
        await writePgProfile(legacyProfile)
        for (const message of legacyProfile.helperThread ?? []) {
          await appendPgThreadMessage(legacyProfile.id, cleanThreadId(threadId, `mode:${message.mode || 'general'}`), message)
        }
      }
      return res.json({ ok: true, profile: publicProfile(legacyProfile ?? null) })
    }
    const store = await readStore()
    const fileOwnerProfile = ownerKey ? store.profiles[profileId(ownerKey)] : undefined
    const filePayerProfile = payer ? store.profiles[profileId(payer)] : undefined
    const fileFallbackProfile = fallbackOwner ? store.profiles[profileId(fallbackOwner)] : undefined
    return res.json({ ok: true, profile: publicProfile(fileOwnerProfile ?? filePayerProfile ?? fileFallbackProfile) })
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const action = cleanString(req.body?.action, 32) || 'save'
  const payer = normalizePayer(req.body?.payer)
  const ownerKey = normalizePayer(req.body?.owner ?? req.body?.ownerKey)
  const fallbackOwner = normalizePayer(req.body?.fallbackOwner)
  if (!payer && !ownerKey) return res.status(400).json({ ok: false, error: 'Missing payer.' })

  const storageKey = ownerKey || payer
  const id = profileId(storageKey)
  const requestThreadId = cleanThreadId(req.body?.threadId, `mode:${cleanString(req.body?.mode, 40) || 'general'}`)
  let store: Store | null = null
  let existing: HelperProfile | undefined
  if (pool) {
    existing = await readPgProfile(id, requestThreadId)
      ?? (fallbackOwner ? await readPgProfile(profileId(fallbackOwner), requestThreadId) : undefined)
    if (!existing) {
      const legacyStore = await readStore()
      existing = legacyStore.profiles[id] ?? (fallbackOwner ? legacyStore.profiles[profileId(fallbackOwner)] : undefined)
      if (existing) {
        await writePgProfile(existing)
        for (const message of existing.helperThread ?? []) {
          await appendPgThreadMessage(existing.id, cleanThreadId(requestThreadId, `mode:${message.mode || 'general'}`), message)
        }
      }
    }
  } else {
    store = await readStore()
    existing = store.profiles[id] ?? (fallbackOwner ? store.profiles[profileId(fallbackOwner)] : undefined)
  }
  const now = Date.now()
  const displayName = cleanString(req.body?.displayName, 80) || existing?.displayName || payer || storageKey
  const requestedMemory = cleanString(req.body?.memorySummary, 1600)
  const question = cleanString(req.body?.question, 1000)
  const answer = cleanString(req.body?.answer, 2000)
  const memorySummary = requestedMemory || deriveMemorySummary({
    existing: existing?.memorySummary,
    displayName,
    question,
    answer,
  })

  const helperThread = existing?.helperThread ?? []

  const next: HelperProfile = {
    id,
    payer: payer || existing?.payer || storageKey,
    displayName,
    ownerKey: ownerKey || existing?.ownerKey,
    accessPayer: cleanString(req.body?.accessPayer, 128) || existing?.accessPayer || payer,
    telegramHandle: cleanString(req.body?.telegramHandle, 80) || existing?.telegramHandle,
    accessEventId: cleanString(req.body?.accessEventId, 128) || existing?.accessEventId,
    preferredPaymentWallet: cleanString(req.body?.preferredPaymentWallet, 120) || existing?.preferredPaymentWallet,
    preferredPaymentNetwork: cleanString(req.body?.preferredPaymentNetwork, 24) || existing?.preferredPaymentNetwork,
    preferredPaymentEvmWallet: cleanString(req.body?.preferredPaymentEvmWallet, 120) || existing?.preferredPaymentEvmWallet,
    preferredPaymentSolanaWallet: cleanString(req.body?.preferredPaymentSolanaWallet, 120) || existing?.preferredPaymentSolanaWallet,
    preferences: cleanList(req.body?.preferences).length ? cleanList(req.body?.preferences) : existing?.preferences ?? [],
    memorySummary,
    memoryProof: existing?.memoryProof,
    helperThread,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  if (action === 'append-thread') {
    const answer = cleanString(req.body?.answer, 1200)
    const paylink = cleanPaylink(req.body?.paylink)
    const actionLinks = cleanActionLinks(req.body?.actionLinks)
    if (!answer && !paylink && actionLinks.length === 0) {
      return res.status(400).json({ ok: false, error: 'Missing helper message.' })
    }
    const message: HelperThreadMessage = {
      id: cleanString(req.body?.id, 80) || `helper-${now.toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
      mode: cleanString(req.body?.mode, 40),
      subMode: cleanString(req.body?.subMode, 40),
      question: cleanString(req.body?.question, 500),
      answer,
      paylink,
      actionLinks,
      receiptId: cleanString(req.body?.receiptId, 120),
      txHash: cleanString(req.body?.txHash, 120),
      createdAt: now,
    }
    next.helperThread = [...helperThread.filter(item => item.id !== message.id), message].slice(-24)
    if (pool) {
      await writePgProfile(next)
      await appendPgThreadMessage(id, requestThreadId, message)
      const saved = await readPgProfile(id, requestThreadId)
      return res.json({ ok: true, profile: publicProfile(saved ?? next), checkpointed: false })
    }
  }

  const clearedThread = action === 'clear-thread'
  if (clearedThread) {
    next.helperThread = []
    if (pool) {
      await writePgProfile(next)
      await clearPgThread(id, requestThreadId)
      const saved = await readPgProfile(id, requestThreadId)
      return res.json({ ok: true, profile: publicProfile(saved ?? next), cleared: true })
    }
  }

  if (action === 'checkpoint') {
    const proof = await checkpointMemory(next)
    if (proof) next.memoryProof = proof
  }

  if (pool) {
    await writePgProfile(next)
    const saved = await readPgProfile(id, requestThreadId)
    return res.json({ ok: true, profile: publicProfile(saved ?? next), checkpointed: action === 'checkpoint' && !!next.memoryProof })
  }

  if (!store) store = await readStore()
  store.profiles[id] = next
  await writeStore(store)
  return res.json({ ok: true, profile: publicProfile(next), checkpointed: action === 'checkpoint' && !!next.memoryProof, cleared: clearedThread })
}


