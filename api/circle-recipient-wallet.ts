import type { Request, Response } from 'express'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import crypto from 'node:crypto'
import { isAddress } from 'viem'

type WalletRecord = {
  emailHash: string
  walletAddress: string
  updatedAt: number
}

type StoreData = {
  wallets: Record<string, WalletRecord>
}

const STORE_PATH = process.env.CIRCLE_RECIPIENT_WALLET_STORE ?? './data/circle-recipient-wallets.json'
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, '')
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const KEY_PREFIX = process.env.CIRCLE_RECIPIENT_WALLET_KEY_PREFIX ?? 'circle-recipient-wallet'

function normalizeEmail(value: unknown) {
  const email = String(value ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ''
  return email
}

function emailHash(email: string) {
  return crypto.createHash('sha256').update(email).digest('hex')
}

async function readStore(): Promise<StoreData> {
  try {
    const raw = await readFile(STORE_PATH, 'utf8')
    return JSON.parse(raw) as StoreData
  } catch {
    return { wallets: {} }
  }
}

async function writeStore(data: StoreData) {
  await mkdir(dirname(STORE_PATH), { recursive: true })
  await writeFile(STORE_PATH, JSON.stringify(data, null, 2))
}

function kvKey(hash: string) {
  return `${KEY_PREFIX}:${hash}`
}

function hasKvStore() {
  return !!UPSTASH_URL && !!UPSTASH_TOKEN
}

async function upstashCommand<T>(command: unknown[]): Promise<T | undefined> {
  if (!hasKvStore()) return undefined
  const response = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([command]),
  })
  const data = await response.json().catch(() => undefined) as Array<{ result?: T; error?: string }> | undefined
  const result = data?.[0]
  if (!response.ok || result?.error) throw new Error(result?.error ?? 'Circle recipient wallet KV request failed')
  return result?.result
}

async function readWalletRecord(hash: string): Promise<WalletRecord | undefined> {
  const kvRecord = await upstashCommand<string | WalletRecord>(['GET', kvKey(hash)])
  if (kvRecord) return typeof kvRecord === 'string' ? JSON.parse(kvRecord) as WalletRecord : kvRecord
  const store = await readStore()
  return store.wallets[hash]
}

async function writeWalletRecord(hash: string, record: WalletRecord) {
  if (hasKvStore()) {
    await upstashCommand<string>(['SET', kvKey(hash), JSON.stringify(record)])
    return
  }
  const store = await readStore()
  store.wallets[hash] = record
  await writeStore(store)
}

export default async function handler(req: Request, res: Response) {
  try {
    if (req.method === 'GET') {
      const email = normalizeEmail(req.query.email)
      if (!email) return res.status(400).json({ ok: false, error: 'Invalid recipient email' })
      const hash = emailHash(email)
      const record = await readWalletRecord(hash)
      return res.json({
        ok: true,
        found: !!record,
        walletAddress: record?.walletAddress,
        updatedAt: record?.updatedAt,
        store: hasKvStore() ? 'kv' : 'file',
      })
    }

    if (req.method === 'POST') {
      const email = normalizeEmail(req.body?.email)
      const walletAddress = String(req.body?.walletAddress ?? '').trim()
      if (!email) return res.status(400).json({ ok: false, error: 'Invalid recipient email' })
      if (!isAddress(walletAddress)) return res.status(400).json({ ok: false, error: 'Invalid Circle wallet address' })
      const hash = emailHash(email)
      const record = { emailHash: hash, walletAddress, updatedAt: Date.now() }
      await writeWalletRecord(hash, record)
      return res.json({ ok: true, walletAddress, updatedAt: record.updatedAt, store: hasKvStore() ? 'kv' : 'file' })
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Circle recipient wallet request failed'
    return res.status(500).json({ ok: false, error: message })
  }
}
