import type { Request, Response } from 'express'
import { randomBytes } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, resolve } from 'path'
import { isAddress } from 'viem'
import { PublicKey } from '@solana/web3.js'

const STORE_PATH = process.env.TELEGRAM_REQUEST_STORE ?? './data/telegram-requests.json'
const MAX_TEXT = 80

type TelegramRequestMode = 'person' | 'group'

type TelegramRequestRecord = {
  id: string
  mode: TelegramRequestMode
  wallet: string
  network: 'base' | 'solana'
  label: string
  amount: string
  target: string
  payUrl: string
  createdAt: number
}

type Store = {
  requests: Record<string, TelegramRequestRecord>
}

function cleanText(value: unknown, fallback = '') {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
}

function cleanAmount(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (!/^\d+(?:\.\d{1,6})?$/.test(raw)) return ''
  return raw
}

function isSolanaAddress(address: string) {
  try {
    const key = new PublicKey(address)
    return key.toBase58() === address
  } catch {
    return false
  }
}

function originFromRequest(req: Request) {
  const configured = process.env.PUBLIC_PAYLINK_ORIGIN ?? process.env.HASH_PAYLINK_BASE_URL
  if (configured) return configured.trim().replace(/\/+$/, '')
  const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https').split(',')[0].trim()
  const host = req.headers['x-forwarded-host'] ?? req.headers.host
  return `${proto}://${host}`
}

async function readStore(): Promise<Store> {
  try {
    const raw = await readFile(resolve(STORE_PATH), 'utf8')
    const parsed = JSON.parse(raw) as Partial<Store>
    return { requests: parsed.requests ?? {} }
  } catch {
    return { requests: {} }
  }
}

async function writeStore(store: Store) {
  const path = resolve(STORE_PATH)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
}

function buildPayUrl(req: Request, record: Omit<TelegramRequestRecord, 'id' | 'payUrl' | 'createdAt'>) {
  const params = new URLSearchParams()
  if (record.amount) params.set('a', record.amount)
  else params.set('f', '1')
  params.set('src', 't')
  params.set('n', record.network)
  if (record.network === 'base') params.set('e', record.wallet)
  else params.set('s', record.wallet)
  params.set('m', record.label)
  if (record.mode === 'group') {
    params.set('v', '1')
    params.set('id', record.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'telegram-request')
  }
  return `${originFromRequest(req)}/pay?${params.toString()}`
}

export default async function handler(req: Request, res: Response) {
  try {
    if (req.method === 'GET') {
      const id = cleanText(req.query.id, '').replace(/[^a-zA-Z0-9_-]/g, '')
      if (!id) return res.status(400).json({ ok: false, error: 'Missing request id' })
      const store = await readStore()
      const request = store.requests[id]
      if (!request) return res.status(404).json({ ok: false, error: 'Telegram request not found' })
      return res.json({ ok: true, request })
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' })
    }

    const body = req.body ?? {}
    const wallet = cleanText(body.wallet, '').slice(0, 96)
    const mode = body.mode === 'group' ? 'group' : 'person'
    const amount = cleanAmount(body.amount)
    const label = cleanText(body.label, mode === 'group' ? 'Telegram collection' : 'Payment request')
    const target = cleanText(body.target, mode === 'group' ? 'Telegram group' : 'Payer')
    const network = wallet.startsWith('0x') ? 'base' : 'solana'
    const validWallet = network === 'base' ? isAddress(wallet) : isSolanaAddress(wallet)

    if (!validWallet) {
      return res.status(400).json({ ok: false, error: 'Enter a valid EVM or Solana receive wallet.' })
    }
    if (!label) return res.status(400).json({ ok: false, error: 'Missing request label' })

    const id = randomBytes(9).toString('base64url')
    const draft = { mode, wallet, network, label, amount, target }
    const record: TelegramRequestRecord = {
      id,
      ...draft,
      payUrl: buildPayUrl(req, draft),
      createdAt: Date.now(),
    }

    const store = await readStore()
    store.requests[id] = record
    await writeStore(store)
    return res.json({ ok: true, request: record, botPayload: `share_${id}` })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Telegram request failed'
    return res.status(500).json({ ok: false, error: message })
  }
}
