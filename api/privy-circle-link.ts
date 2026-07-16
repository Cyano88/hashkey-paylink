import type { Request, Response } from 'express'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, resolve } from 'path'
import pg from 'pg'
import { isAddress } from 'viem'
import { PublicKey } from '@solana/web3.js'
import { PrivyClient, type User } from '@privy-io/server-auth'
import { listCircleUserWallets, type CircleUserWallet } from './circle-solana-email.js'

const STORE_PATH = process.env.PRIVY_CIRCLE_LINK_STORE ?? './data/privy-circle-links.json'
const DATABASE_URL = (process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim()
const IS_RENDER = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL)

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

export type CircleLinkRecord = {
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

export type CircleLinkChain = CircleLinkRecord['chain']
export type CircleLinkPurpose = NonNullable<CircleLinkRecord['purpose']>
export type CircleLinkWallet = { id: string; address: string; blockchain: string }

export type VerifiedLinkUser = { userId: string; email?: string }

type LinkHandlerDependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  read(key: string): Promise<CircleLinkRecord | null>
  write(key: string, record: CircleLinkRecord): Promise<void>
  remove(key: string): Promise<void>
  verifyWallet(input: { userToken: string; chain: CircleLinkChain; wallet: CircleLinkWallet }): Promise<void>
}

export type CircleLinkMutationResult = {
  link: CircleLinkRecord | null
  unchanged: boolean
}

export class CircleLinkVersionConflictError extends Error {
  status = 409

  constructor() {
    super('Circle wallet link changed since it was loaded. Refresh and try again.')
  }
}

export function circleLinkKey(privyUserId: string, chain: string, purpose = 'payment') {
  return purpose === 'payment' ? `${privyUserId}:${chain}` : `${privyUserId}:${purpose}:${chain}`
}

function sameLink(left: CircleLinkRecord, right: CircleLinkRecord) {
  return left.privyUserId === right.privyUserId
    && left.email === right.email
    && left.chain === right.chain
    && (left.purpose ?? 'payment') === (right.purpose ?? 'payment')
    && left.circleWalletId === right.circleWalletId
    && sameAddress(left.chain, left.circleWalletAddress, right.circleWalletAddress)
    && left.circleBlockchain === right.circleBlockchain
}

export function applyCircleLinkSet(
  store: Store,
  key: string,
  candidate: CircleLinkRecord,
  expectedUpdatedAt?: number,
  now = Date.now,
): CircleLinkMutationResult {
  const existing = store.links[key]
  if (existing && sameLink(existing, candidate)) return { link: existing, unchanged: true }
  if (existing) {
    if (expectedUpdatedAt === undefined || existing.updatedAt !== expectedUpdatedAt) throw new CircleLinkVersionConflictError()
  } else if (expectedUpdatedAt !== undefined) {
    throw new CircleLinkVersionConflictError()
  }
  const link = { ...candidate, updatedAt: now() }
  store.links[key] = link
  return { link, unchanged: false }
}

export function applyCircleLinkDelete(store: Store, key: string, expectedUpdatedAt?: number): CircleLinkMutationResult {
  const existing = store.links[key]
  if (!existing) return { link: null, unchanged: true }
  if (expectedUpdatedAt === undefined || existing.updatedAt !== expectedUpdatedAt) throw new CircleLinkVersionConflictError()
  delete store.links[key]
  return { link: null, unchanged: false }
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

function expectedBlockchain(chain: CircleLinkChain) {
  if (chain === 'base') return 'BASE'
  if (chain === 'arbitrum') return 'ARB'
  if (chain === 'arc') return 'ARC-TESTNET'
  return (process.env.CIRCLE_SOLANA_BLOCKCHAIN ?? 'SOL').trim().toUpperCase()
}

function sameAddress(chain: CircleLinkChain, left: string, right: string) {
  return chain === 'solana' ? left === right : left.toLowerCase() === right.toLowerCase()
}

export async function verifyCircleLinkWallet(input: {
  userToken: string
  chain: CircleLinkChain
  wallet: CircleLinkWallet
  listWallets?: (userToken: string, chain: string) => Promise<CircleUserWallet[]>
}) {
  const wallets = await (input.listWallets ?? listCircleUserWallets)(input.userToken, input.chain)
  const expected = expectedBlockchain(input.chain)
  const owned = wallets.some(wallet => (
    input.wallet.blockchain.trim().toUpperCase() === expected
    && wallet.id === input.wallet.id
    && sameAddress(input.chain, wallet.address, input.wallet.address)
    && wallet.blockchain.trim().toUpperCase() === expected
  ))
  if (!owned) {
    const error = new Error('Circle wallet ownership could not be verified for the signed-in wallet session.')
    ;(error as Error & { status?: number }).status = 403
    throw error
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

let localMutationQueue: Promise<void> = Promise.resolve()

async function mutateLocalStore(mutate: (store: Store) => void) {
  const mutation = localMutationQueue.then(async () => {
    const store = await readStore()
    mutate(store)
    await writeStore(store)
  })
  localMutationQueue = mutation.catch(() => undefined)
  await mutation
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

export async function readCircleLink(key: string): Promise<CircleLinkRecord | null> {
  if (pool) {
    await ensureSchema()
    const result = await pool.query('select * from privy_circle_links where link_key = $1 limit 1', [key])
    if (!result.rowCount) return null
    return rowToRecord(result.rows[0])
  }
  if (IS_RENDER) {
    throw Object.assign(new Error('Durable Circle wallet link storage is not configured. Add DATABASE_URL on Render.'), { status: 503 })
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
         updated_at = now()
       where privy_circle_links.email is distinct from excluded.email
          or privy_circle_links.circle_wallet_id is distinct from excluded.circle_wallet_id
          or privy_circle_links.circle_wallet_address is distinct from excluded.circle_wallet_address
          or privy_circle_links.circle_blockchain is distinct from excluded.circle_blockchain`,
      [key, record.privyUserId, record.email ?? null, record.chain, record.purpose ?? null,
       record.circleWalletId, record.circleWalletAddress, record.circleBlockchain],
    )
    return
  }
  if (IS_RENDER) throw new Error('Durable Circle wallet link storage is not configured. Add DATABASE_URL on Render.')
  await mutateLocalStore(store => {
    const existing = store.links[key]
    if (
      existing
      && existing.email === record.email
      && existing.circleWalletId === record.circleWalletId
      && sameAddress(record.chain, existing.circleWalletAddress, record.circleWalletAddress)
      && existing.circleBlockchain === record.circleBlockchain
    ) return
    store.links[key] = record
  })
}

async function deleteLink(key: string): Promise<void> {
  if (pool) {
    await ensureSchema()
    await pool.query('delete from privy_circle_links where link_key = $1', [key])
    return
  }
  if (IS_RENDER) throw new Error('Durable Circle wallet link storage is not configured. Add DATABASE_URL on Render.')
  await mutateLocalStore(store => { delete store.links[key] })
}

export async function compareAndSetCircleLink(
  key: string,
  candidate: CircleLinkRecord,
  expectedUpdatedAt?: number,
): Promise<CircleLinkMutationResult> {
  if (pool) {
    await ensureSchema()
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [key])
      const currentResult = await client.query('select * from privy_circle_links where link_key = $1 limit 1', [key])
      const existing = currentResult.rowCount ? rowToRecord(currentResult.rows[0]) : undefined
      const decision = applyCircleLinkSet({ links: existing ? { [key]: existing } : {} }, key, candidate, expectedUpdatedAt)
      if (decision.unchanged) {
        await client.query('commit')
        return decision
      }
      const saved = await client.query(
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
           updated_at = now()
         returning *`,
        [key, candidate.privyUserId, candidate.email ?? null, candidate.chain, candidate.purpose ?? null,
         candidate.circleWalletId, candidate.circleWalletAddress, candidate.circleBlockchain],
      )
      await client.query('commit')
      return { link: rowToRecord(saved.rows[0]), unchanged: false }
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }
  if (IS_RENDER) throw new Error('Durable Circle wallet link storage is not configured. Add DATABASE_URL on Render.')

  let result: CircleLinkMutationResult | undefined
  await mutateLocalStore(store => { result = applyCircleLinkSet(store, key, candidate, expectedUpdatedAt) })
  if (!result) throw new Error('Local Circle wallet link storage did not return a mutation result.')
  return result
}

export async function compareAndDeleteCircleLink(key: string, expectedUpdatedAt?: number): Promise<CircleLinkMutationResult> {
  if (pool) {
    await ensureSchema()
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [key])
      const currentResult = await client.query('select * from privy_circle_links where link_key = $1 limit 1', [key])
      const existing = currentResult.rowCount ? rowToRecord(currentResult.rows[0]) : undefined
      const decision = applyCircleLinkDelete({ links: existing ? { [key]: existing } : {} }, key, expectedUpdatedAt)
      if (!decision.unchanged) await client.query('delete from privy_circle_links where link_key = $1', [key])
      await client.query('commit')
      return decision
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }
  if (IS_RENDER) throw new Error('Durable Circle wallet link storage is not configured. Add DATABASE_URL on Render.')

  let result: CircleLinkMutationResult | undefined
  await mutateLocalStore(store => { result = applyCircleLinkDelete(store, key, expectedUpdatedAt) })
  if (!result) throw new Error('Local Circle wallet link storage did not return a mutation result.')
  return result
}

export async function verifiedPrivyUser(req: Request): Promise<VerifiedLinkUser> {
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
  return { userId: claims.userId, email: linkedEmail(user) }
}

export function createPrivyCircleLinkHandler(dependencies: LinkHandlerDependencies) {
  return async function handler(req: Request, res: Response) {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' })
    }

    try {
      const { action, chain: rawChain, purpose: rawPurpose, email, wallet: rawWallet, circleUserToken } = (req.body ?? {}) as {
        action?: string
        chain?: string
        purpose?: string
        email?: string
        circleUserToken?: string
        wallet?: { id?: string; address?: string; blockchain?: string }
      }
      if (!action) return res.status(400).json({ ok: false, error: 'Missing action' })
      if (!rawChain || !SUPPORTED_CHAINS.has(rawChain)) {
        return res.status(400).json({ ok: false, error: 'Unsupported Circle link chain' })
      }
      if (rawPurpose !== undefined && rawPurpose !== 'payment' && rawPurpose !== 'agent') {
        return res.status(400).json({ ok: false, error: 'Unsupported Circle link purpose' })
      }

      const chain = rawChain as CircleLinkChain
      const purpose: CircleLinkPurpose = rawPurpose === 'agent' ? 'agent' : 'payment'
      const { userId, email: verifiedEmail } = await dependencies.verifyUser(req)
      const key = circleLinkKey(userId, chain, purpose)

      if (action === 'resolve') {
        const link = await dependencies.read(key)
        return res.json({ ok: true, email: verifiedEmail, link })
      }

      if (action === 'unlink') {
        await dependencies.remove(key)
        return res.json({ ok: true, email: verifiedEmail, link: null })
      }

      if (action === 'link') {
        const wallet: CircleLinkWallet = {
          id: String(rawWallet?.id ?? '').trim(),
          address: String(rawWallet?.address ?? '').trim(),
          blockchain: String(rawWallet?.blockchain ?? '').trim().toUpperCase(),
        }
        if (!wallet.id || !wallet.address || !wallet.blockchain) {
          return res.status(400).json({ ok: false, error: 'Missing Circle wallet metadata' })
        }
        if (wallet.id.length > 256 || wallet.address.length > 128 || wallet.blockchain.length > 64) {
          return res.status(400).json({ ok: false, error: 'Circle wallet metadata is too long' })
        }
        const validWalletAddress = chain === 'solana'
          ? isSolanaAddress(wallet.address)
          : isAddress(wallet.address)
        if (!validWalletAddress) {
          return res.status(400).json({ ok: false, error: 'Invalid Circle wallet address' })
        }
        if (purpose === 'payment' && wallet.blockchain !== expectedBlockchain(chain)) {
          return res.status(400).json({ ok: false, error: 'Circle wallet blockchain does not match the selected chain' })
        }

        const normalizedEmail = email?.trim().toLowerCase()
        if (verifiedEmail && normalizedEmail && verifiedEmail !== normalizedEmail) {
          return res.status(403).json({
            ok: false,
            error: 'Privy email does not match the Circle wallet email. Use the same email for both logins.',
          })
        }

        if (purpose === 'payment') {
          const userToken = String(circleUserToken ?? '').trim()
          if (!userToken || userToken.length > 8_000) {
            return res.status(400).json({ ok: false, error: 'A valid Circle wallet session is required to link this wallet.' })
          }
          await dependencies.verifyWallet({ userToken, chain, wallet })
        }

        const record: CircleLinkRecord = {
          privyUserId: userId,
          email: verifiedEmail ?? normalizedEmail,
          chain,
          purpose,
          circleWalletId: wallet.id,
          circleWalletAddress: wallet.address,
          circleBlockchain: wallet.blockchain,
          updatedAt: Date.now(),
        }
        await dependencies.write(key, record)
        return res.json({ ok: true, link: record })
      }

      return res.status(400).json({ ok: false, error: `Unknown action: ${action}` })
    } catch (err) {
      const error = err as Error & { status?: number }
      return res.status(error.status ?? 500).json({ ok: false, error: error.message || 'Privy Circle link request failed' })
    }
  }
}

export default createPrivyCircleLinkHandler({
  verifyUser: verifiedPrivyUser,
  read: readCircleLink,
  write: writeLink,
  remove: deleteLink,
  verifyWallet: verifyCircleLinkWallet,
})
