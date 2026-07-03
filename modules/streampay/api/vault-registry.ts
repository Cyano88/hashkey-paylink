/**
 * /api/register-vault  POST  — viewer's device auto-submits ghost vault after each sign
 * /api/get-vault       GET   — creator fetches latest vault for settlement dashboard
 *
 * Keyed by contentId_viewerAddress (lowercase).
 * Only the latest (highest amountRaw) entry is kept per pair.
 * Storage: in-memory — replace with Redis for production persistence.
 */

import type { Request, Response } from 'express'
import pg from 'pg'
import { isAddress } from 'viem'

type VaultEntry = {
  sig:       string
  amountRaw: string
  nonce:     string
  deadline:  string
  viewer:    string
  creator:   string
  contentId: string
  ts:        number
}

const registry = new Map<string, VaultEntry>()
const DATABASE_URL = (process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim()
if (process.env.RENDER && !DATABASE_URL) {
  throw new Error('DATABASE_URL or POSTGRES_URL is required for durable creator vault storage on Render.')
}
const { Pool } = pg
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
    })
  : null

let schemaReady: Promise<void> | null = null

function ensureSchema() {
  if (!pool) return Promise.resolve()
  if (!schemaReady) {
    schemaReady = pool.query(`
      create table if not exists streampay_creator_vaults (
        vault_key text primary key,
        content_id text not null,
        viewer text not null,
        creator text not null,
        sig text not null,
        amount_raw numeric not null,
        nonce text not null,
        deadline text not null,
        signed_at bigint not null,
        updated_at timestamptz not null default now()
      );
      create index if not exists streampay_creator_vaults_content_idx on streampay_creator_vaults (content_id, updated_at desc);
      create index if not exists streampay_creator_vaults_creator_idx on streampay_creator_vaults (creator);
    `).then(() => undefined)
  }
  return schemaReady
}

function key(contentId: string, viewer: string) {
  return `${contentId}_${viewer.toLowerCase()}`
}

function rowToVaultEntry(row: Record<string, unknown>): VaultEntry {
  return {
    sig: String(row.sig ?? ''),
    amountRaw: String(row.amount_raw ?? '0'),
    nonce: String(row.nonce ?? ''),
    deadline: String(row.deadline ?? ''),
    viewer: String(row.viewer ?? '').toLowerCase(),
    creator: String(row.creator ?? '').toLowerCase(),
    contentId: String(row.content_id ?? ''),
    ts: Number(row.signed_at ?? Date.now()),
  }
}

async function readVaultEntry(contentId: string, viewer: string): Promise<VaultEntry | null> {
  const vaultKey = key(contentId, viewer)
  if (pool) {
    await ensureSchema()
    const result = await pool.query('select * from streampay_creator_vaults where vault_key = $1 limit 1', [vaultKey])
    if (!result.rowCount) return null
    return rowToVaultEntry(result.rows[0])
  }
  return registry.get(vaultKey) ?? null
}

async function writeVaultEntry(entry: VaultEntry) {
  const vaultKey = key(entry.contentId, entry.viewer)
  if (pool) {
    await ensureSchema()
    await pool.query(
      `insert into streampay_creator_vaults
        (vault_key, content_id, viewer, creator, sig, amount_raw, nonce, deadline, signed_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
       on conflict (vault_key) do update set
         content_id = excluded.content_id,
         viewer = excluded.viewer,
         creator = excluded.creator,
         sig = excluded.sig,
         amount_raw = excluded.amount_raw,
         nonce = excluded.nonce,
         deadline = excluded.deadline,
         signed_at = excluded.signed_at,
         updated_at = now()
       where streampay_creator_vaults.amount_raw <= excluded.amount_raw`,
      [vaultKey, entry.contentId, entry.viewer, entry.creator, entry.sig, entry.amountRaw, entry.nonce, entry.deadline, entry.ts],
    )
    return
  }
  registry.set(vaultKey, entry)
}

async function listVaultEntries(contentId: string): Promise<VaultEntry[]> {
  if (pool) {
    await ensureSchema()
    const result = await pool.query(
      'select * from streampay_creator_vaults where content_id = $1 order by updated_at desc',
      [contentId],
    )
    return result.rows.map(rowToVaultEntry)
  }
  const prefix = `${contentId}_`
  return Array.from(registry.entries())
    .filter(([k]) => k.startsWith(prefix))
    .map(([, entry]) => entry)
    .sort((a, b) => b.ts - a.ts)
}

// ── POST /api/register-vault ──────────────────────────────────────────────────
export async function registerVault(req: Request, res: Response) {
  const body = (req.body ?? {}) as Partial<VaultEntry>
  const { sig, amountRaw, nonce, deadline, viewer, creator, contentId } = body

  if (!sig || !amountRaw || !nonce || !deadline || !viewer || !creator || !contentId) {
    return res.status(400).json({ ok: false, error: 'Missing vault fields' })
  }
  if (!isAddress(viewer) || !isAddress(creator)) {
    return res.status(400).json({ ok: false, error: 'viewer and creator must be valid EVM addresses' })
  }

  const existing = await readVaultEntry(contentId, viewer)

  // Only store if this entry has a higher amount than what we already have
  if (!existing || BigInt(amountRaw) >= BigInt(existing.amountRaw)) {
    await writeVaultEntry({
      sig, amountRaw, nonce, deadline,
      viewer: viewer.toLowerCase(),
      creator: creator.toLowerCase(),
      contentId,
      ts: body.ts ?? Date.now(),
    })
  }

  return res.status(200).json({ ok: true })
}

// ── GET /api/get-vault ────────────────────────────────────────────────────────
export async function getVault(req: Request, res: Response) {
  const { id, viewer } = req.query as { id?: string; viewer?: string }

  if (!id || !viewer) {
    return res.status(400).json({ ok: false, error: 'id and viewer are required' })
  }

  const entry = await readVaultEntry(id, viewer)
  if (!entry) {
    return res.status(404).json({
      ok:    false,
      error: 'No vault found - viewer may not have signed yet.',
    })
  }

  return res.status(200).json({ ok: true, vault: entry })
}

// ── GET /api/list-viewers ─────────────────────────────────────────────────────
// Returns all viewer vaults registered for a given contentId.
// Creator uses this to discover who has signed without needing viewer addresses.
export async function listViewers(req: Request, res: Response) {
  const { id } = req.query as { id?: string }

  if (!id) return res.status(400).json({ ok: false, error: 'id is required' })

  const viewers = (await listVaultEntries(id))
    .map(entry => ({
      viewer:    entry.viewer,
      amountRaw: entry.amountRaw,
      ts:        entry.ts,
    }))

  return res.status(200).json({ ok: true, viewers })
}
