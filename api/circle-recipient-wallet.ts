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

export default async function handler(req: Request, res: Response) {
  try {
    if (req.method === 'GET') {
      const email = normalizeEmail(req.query.email)
      if (!email) return res.status(400).json({ ok: false, error: 'Invalid recipient email' })
      const hash = emailHash(email)
      const store = await readStore()
      const record = store.wallets[hash]
      return res.json({
        ok: true,
        found: !!record,
        walletAddress: record?.walletAddress,
        updatedAt: record?.updatedAt,
      })
    }

    if (req.method === 'POST') {
      const email = normalizeEmail(req.body?.email)
      const walletAddress = String(req.body?.walletAddress ?? '').trim()
      if (!email) return res.status(400).json({ ok: false, error: 'Invalid recipient email' })
      if (!isAddress(walletAddress)) return res.status(400).json({ ok: false, error: 'Invalid Circle wallet address' })
      const hash = emailHash(email)
      const store = await readStore()
      store.wallets[hash] = { emailHash: hash, walletAddress, updatedAt: Date.now() }
      await writeStore(store)
      return res.json({ ok: true, walletAddress, updatedAt: store.wallets[hash].updatedAt })
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Circle recipient wallet request failed'
    return res.status(500).json({ ok: false, error: message })
  }
}
