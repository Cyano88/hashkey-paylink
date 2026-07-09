import type { Request, Response } from 'express'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, resolve } from 'path'
import pg from 'pg'
import { isAddress } from 'viem'
import { PublicKey } from '@solana/web3.js'
import { PrivyClient, type User } from '@privy-io/server-auth'

const STORE_PATH = process.env.PRIVY_CIRCLE_LINK_STORE ?? './data/privy-circle-links.json'
const DATABASE_URL = (process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim()

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
      create table if not exists privy_circle_links (
        link_key text primary key,
        privy_user_id text not null,
        email text,
        chain text not null,
        purpose text,
        circle_wallet_id text not null,
        circle_wallet_address text not null,
        circle_blockchain text not null,
        updated_at timestamptz not null default now()
      );
      create index if not exists privy_circle_links_user_chain_idx on privy_circle_links (privy_user_id, chain);
    `).then(() => undefined)
  }
  return schemaReady
}

const SUPPORTED_CHAINS = new Set(['base', 'arbitrum', 'arc', 'solana'])

type CircleLinkRecord = {
  privyUserId: string
  email?: string
  chain: 'base' | 'arbitrum' | 'arc' | 'solana'
  purpose?: 'payment' | 'agent'
  circleWalletId: string
  circleWalletAddress: string
  circleBlockchain: string
  updatedAt: number
}

type Store = {
  links: Record<string, CircleLinkRecord>
}

function linkKey(privyUserId: string, chain: string, purpose = 'payment') {
  return purpose === 'payment' ? `${privyUserId}:${chain}` : `${privyUserId}:${purpose}:${chain}`
}

function getBearerToken(req: Request) {
  const auth = req.headers.authorization ?? ''
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match?.[1]
}

function linkedEmail(user: User) {
  for (const account of user.linkedAccounts ?? []) {
    if (account.type === 'email' && 'address' in account && typeof account.address === 'string') {
      return account.address.toLowerCase()
    }
  }
  return undefined
}

function isSolanaAddress(address: string) {
  try {
    const key = new PublicKey(address)
    return key.toBase58() === address
  } catch {
    return false
  }
}

async function readStore(): Promise<Store> {
  try {
    const raw = await readFile(resolve(STORE_PATH), 'utf8')
    const parsed = JSON.parse(raw) as Partial<Store>
    return { links: parsed.links ?? {} }
  } catch {
    return { links: {} }
  }
}

async function writeStore(store: Store) {
  const path = resolve(STORE_PATH)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
}

function rowToRecord(row: Record<string, unknown>): CircleLinkRecord {
  return {
    privyUserId: String(row.privy_user_id),
    email: row.email ? String(row.email) : undefined,
    chain: String(row.chain) as CircleLinkRecord['chain'],
    purpose: row.purpose ? String(row.purpose) as CircleLinkRecord['purpose'] : undefined,
    circleWalletId: String(row.circle_wallet_id),
    circleWalletAddress: String(row.circle_wallet_address),
    circleBlockchain: String(row.circle_blockchain),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.getTime() : Date.now(),
  }
}

async function readLink(key: string): Promise<CircleLinkRecord | null> {
  if (pool) {
    await ensureSchema()
    const result = await pool.query('select * from privy_circle_links where link_key = $1 limit 1', [key])
    if (!result.rowCount) return null
    return rowToRecord(result.rows[0])
  }
  const store = await readStore()
  return store.links[key] ?? null
}

async function writeLink(key: string, record: CircleLinkRecord): Promise<void> {
  if (pool) {
    await ensureSchema()
    await pool.query(
      `insert into privy_circle_links
        (link_key, privy_user_id, email, chain, purpose, circle_wallet_id, circle_wallet_address, circle_blockchain, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8, now())
       on conflict (link_key) do update set
         privy_user_id = excluded.privy_user_id,
         email = excluded.email,
         chain = excluded.chain,
         purpose = excluded.purpose,
         circle_wallet_id = excluded.circle_wallet_id,
         circle_wallet_address = excluded.circle_wallet_address,
         circle_blockchain = excluded.circle_blockchain,
         updated_at = now()`,
      [key, record.privyUserId, record.email ?? null, record.chain, record.purpose ?? null,
       record.circleWalletId, record.circleWalletAddress, record.circleBlockchain],
    )
    return
  }
  const store = await readStore()
  store.links[key] = record
  await writeStore(store)
}

async function deleteLink(key: string): Promise<void> {
  if (pool) {
    await ensureSchema()
    await pool.query('delete from privy_circle_links where link_key = $1', [key])
    return
  }
  const store = await readStore()
  delete store.links[key]
  await writeStore(store)
}

async function verifiedPrivyUser(req: Request) {
  const privyAppId = process.env.PRIVY_APP_ID ?? process.env.VITE_PRIVY_APP_ID
  const privyAppSecret = process.env.PRIVY_APP_SECRET
  if (!privyAppId || !privyAppSecret) {
    const err = new Error('Privy Circle linking is not configured. Set PRIVY_APP_ID and PRIVY_APP_SECRET server-side.')
    ;(err as Error & { status?: number }).status = 503
    throw err
  }
  const token = getBearerToken(req)
  if (!token) {
    const err = new Error('Missing Privy access token.')
    ;(err as Error & { status?: number }).status = 401
    throw err
  }
  const client = new PrivyClient(privyAppId, privyAppSecret)
  const claims = await client.verifyAuthToken(token)
  const user = await client.getUserById(claims.userId)
  return { claims, user, email: linkedEmail(user) }
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  try {
    const { action, chain, purpose: rawPurpose, email, wallet } = (req.body ?? {}) as {
      action?: string
      chain?: string
      purpose?: string
      email?: string
      wallet?: { id?: string; address?: string; blockchain?: string }
    }
    if (!action) return res.status(400).json({ ok: false, error: 'Missing action' })
    if (!chain || !SUPPORTED_CHAINS.has(chain)) {
      return res.status(400).json({ ok: false, error: 'Unsupported Circle link chain' })
    }

    const { claims, email: verifiedEmail } = await verifiedPrivyUser(req)
    const purpose = rawPurpose === 'agent' ? 'agent' : 'payment'
    const key = linkKey(claims.userId, chain, purpose)

    if (action === 'resolve') {
      const link = await readLink(key)
      return res.json({ ok: true, email: verifiedEmail, link })
    }

    if (action === 'unlink') {
      await deleteLink(key)
      return res.json({ ok: true, email: verifiedEmail, link: null })
    }

    if (action === 'link') {
      if (!wallet?.id || !wallet.address || !wallet.blockchain) {
        return res.status(400).json({ ok: false, error: 'Missing Circle wallet metadata' })
      }
      const validWalletAddress = chain === 'solana'
        ? isSolanaAddress(wallet.address)
        : isAddress(wallet.address)
      if (!validWalletAddress) {
        return res.status(400).json({ ok: false, error: 'Invalid Circle wallet address' })
      }

      const normalizedEmail = email?.trim().toLowerCase()
      if (verifiedEmail && normalizedEmail && verifiedEmail !== normalizedEmail) {
        return res.status(403).json({
          ok: false,
          error: 'Privy email does not match the Circle wallet email. Use the same email for both logins.',
        })
      }

      const record: CircleLinkRecord = {
        privyUserId: claims.userId,
        email: verifiedEmail ?? normalizedEmail,
        chain: chain as CircleLinkRecord['chain'],
        purpose,
        circleWalletId: wallet.id,
        circleWalletAddress: wallet.address,
        circleBlockchain: wallet.blockchain,
        updatedAt: Date.now(),
      }
      await writeLink(key, record)
      return res.json({ ok: true, link: record })
    }

    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` })
  } catch (err) {
    const e = err as Error & { status?: number }
    return res.status(e.status ?? 500).json({ ok: false, error: e.message || 'Privy Circle link request failed' })
  }
}
