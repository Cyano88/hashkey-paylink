import type { Request, Response } from 'express'
import { randomBytes } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, resolve } from 'path'
import { isAddress } from 'viem'
import { PublicKey } from '@solana/web3.js'
import {
  circlePocketIdentityErrorStatus,
  circlePocketIdentityId,
  resolveCirclePocketIdentity,
} from './circle-pocket-identity.js'
import { recordCirclePocketAction } from './circle-pocket-action-journal.js'

const STORE_PATH = process.env.TELEGRAM_REQUEST_STORE ?? './data/telegram-requests.json'
const MAX_TEXT = 80

type TelegramRequestMode = 'person' | 'group'
type TelegramRequestKind = 'payment-request' | 'polymarket-funding'
type TelegramRequestNetwork = 'base' | 'arc' | 'solana' | 'arbitrum' | 'all'

type TelegramRequestRecord = {
  id: string
  eventId?: string
  mode: TelegramRequestMode
  kind?: TelegramRequestKind
  wallet: string
  network: TelegramRequestNetwork
  evmWallet?: string
  solanaWallet?: string
  polymarketWallet?: string
  label: string
  amount: string
  target: string
  payUrl: string
  dashboardUrl?: string
  createdAt: number
  ownerId?: string
  idempotencyKey?: string
}

type Store = {
  requests: Record<string, TelegramRequestRecord>
}
type TelegramRequestDraft = Omit<TelegramRequestRecord, 'id' | 'payUrl' | 'createdAt' | 'ownerId' | 'idempotencyKey'>

let storeMutationQueue: Promise<void> = Promise.resolve()

async function mutateStore<T>(mutation: (store: Store) => Promise<T> | T) {
  let release!: () => void
  const previous = storeMutationQueue
  storeMutationQueue = new Promise<void>(resolveQueue => { release = resolveQueue })
  await previous
  try {
    const store = await readStore()
    const result = await mutation(store)
    await writeStore(store)
    return result
  } finally {
    release()
  }
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

function cleanNetwork(value: unknown, fallback: TelegramRequestNetwork): TelegramRequestNetwork {
  if (value === 'arc' || value === 'solana' || value === 'arbitrum' || value === 'all') return value
  if (value === 'base') return 'base'
  return fallback
}

function isEvmNetwork(network: TelegramRequestNetwork) {
  return network === 'base' || network === 'arc' || network === 'arbitrum'
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

function buildPayUrl(req: Request, record: TelegramRequestDraft) {
  const params = new URLSearchParams()
  if (record.amount) params.set('a', record.amount)
  else params.set('f', '1')
  params.set('src', 't')
  if (record.network === 'all') {
    params.set('x', '1')
    if (record.evmWallet) params.set('e', record.evmWallet)
    if (record.solanaWallet) params.set('s', record.solanaWallet)
  } else {
    params.set('n', record.network)
    if (record.network === 'solana') params.set('s', record.solanaWallet || record.wallet)
    else params.set('e', record.evmWallet || record.wallet)
  }
  params.set('m', record.kind === 'polymarket-funding' ? 'Polymarket' : record.label)
  if (record.kind === 'polymarket-funding') {
    params.set('brand', 'polymarket')
    params.set('pm', '1')
    params.set('funding', record.target)
  }
  if (record.mode === 'group') {
    params.set('v', '1')
    params.set('id', record.eventId || collectionEventId(record.label, 'telegram-request'))
  }
  return `${originFromRequest(req)}/pay?${params.toString()}`
}

function buildDashboardUrl(req: Request, record: TelegramRequestDraft) {
  if (record.mode !== 'group') return ''
  const params = new URLSearchParams()
  params.set('id', record.eventId || collectionEventId(record.label, 'telegram-request'))
  if (record.amount) params.set('a', record.amount)
  else params.set('f', '1')
  if (record.network === 'all') {
    params.set('x', '1')
    if (record.evmWallet) params.set('e', record.evmWallet)
    if (record.solanaWallet) params.set('s', record.solanaWallet)
  } else {
    params.set('n', record.network)
    if (record.network === 'solana') params.set('s', record.solanaWallet || record.wallet)
    else params.set('e', record.evmWallet || record.wallet)
  }
  params.set('m', record.label)
  return `${originFromRequest(req)}/event?${params.toString()}`
}

function collectionEventId(label: string, fallback: string, suffix = '') {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback
  return suffix ? `${slug}-${suffix}` : slug
}

function publicRequest(record: TelegramRequestRecord) {
  const { ownerId: _ownerId, idempotencyKey: _idempotencyKey, ...safe } = record
  return safe
}

export default async function handler(req: Request, res: Response) {
  try {
    if (req.method === 'GET') {
      const id = cleanText(req.query.id, '').replace(/[^a-zA-Z0-9_-]/g, '')
      if (!id) return res.status(400).json({ ok: false, error: 'Missing request id' })
      const store = await readStore()
      const request = store.requests[id]
      if (!request) return res.status(404).json({ ok: false, error: 'Telegram request not found' })
      return res.json({ ok: true, request: publicRequest(request) })
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' })
    }

    let identity
    try {
      identity = await resolveCirclePocketIdentity(req)
    } catch (error) {
      return res.status(circlePocketIdentityErrorStatus(error)).json({
        ok: false,
        error: error instanceof Error ? error.message : 'Unauthorized Circle Pocket session.',
      })
    }
    const ownerId = circlePocketIdentityId(identity)
    const idempotencyKey = cleanText(req.headers['idempotency-key'] ?? req.body?.idempotencyKey, '').slice(0, 128)
    if (!/^[a-zA-Z0-9:_-]{16,128}$/.test(idempotencyKey)) {
      return res.status(400).json({ ok: false, error: 'Missing or invalid idempotency key.' })
    }

    const body = req.body ?? {}
    const wallet = cleanText(body.wallet, '').slice(0, 96)
    const evmWallet = cleanText(body.evmWallet, '').slice(0, 96)
    const solanaWallet = cleanText(body.solanaWallet, '').slice(0, 96)
    const mode: TelegramRequestMode = body.mode === 'group' ? 'group' : 'person'
    const amount = cleanAmount(body.amount)
    const kind: TelegramRequestKind = body.kind === 'polymarket-funding' ? 'polymarket-funding' : 'payment-request'
    const label = cleanText(body.label, mode === 'group' ? 'Telegram collection' : 'Payment request')
    const target = cleanText(body.target, mode === 'group' ? 'Telegram group' : 'Payer')
    const inferredNetwork: TelegramRequestNetwork = wallet.startsWith('0x') ? 'base' : 'solana'
    const network = cleanNetwork(body.network, inferredNetwork)
    const primaryWallet = network === 'all'
      ? evmWallet
      : network === 'solana'
        ? solanaWallet || wallet
        : evmWallet || wallet
    const validWallet = network === 'all'
      ? isAddress(evmWallet) && isSolanaAddress(solanaWallet)
      : network === 'solana'
        ? isSolanaAddress(primaryWallet)
        : isEvmNetwork(network) && isAddress(primaryWallet)

    if (!validWallet) {
      return res.status(400).json({ ok: false, error: network === 'all' ? 'Enter valid EVM and Solana receive wallets.' : 'Enter a valid receive wallet.' })
    }
    if (!label) return res.status(400).json({ ok: false, error: 'Missing request label' })
    if (kind === 'polymarket-funding') {
      if (network === 'arc' || network === 'all') {
        return res.status(400).json({ ok: false, error: 'Polymarket Bridge supports Base, Arbitrum, or Solana funding.' })
      }
    }

    const id = randomBytes(9).toString('base64url')
    const eventId = mode === 'group' ? collectionEventId(label, 'telegram-request', id.slice(0, 6).toLowerCase()) : undefined
    const draft: TelegramRequestDraft = {
      eventId,
      mode,
      kind,
      wallet: primaryWallet,
      network,
      evmWallet: network === 'all' || isEvmNetwork(network) ? evmWallet || primaryWallet : '',
      solanaWallet: network === 'all' || network === 'solana' ? solanaWallet || primaryWallet : '',
      polymarketWallet: cleanText(body.polymarketWallet, '').slice(0, 96),
      label,
      amount,
      target,
    }
    const record: TelegramRequestRecord = {
      id,
      ...draft,
      payUrl: buildPayUrl(req, draft),
      dashboardUrl: buildDashboardUrl(req, draft),
      createdAt: Date.now(),
      ownerId,
      idempotencyKey,
    }
    const saved = await mutateStore(store => {
      const existing = Object.values(store.requests).find(item => (
        item.ownerId === ownerId && item.idempotencyKey === idempotencyKey
      ))
      if (existing) return { record: existing, replayed: true }
      store.requests[id] = record
      return { record, replayed: false }
    })
    await recordCirclePocketAction({
      ownerId,
      idempotencyKey,
      action: 'create-usdc-paylink',
      status: 'completed',
      resourceId: saved.record.id,
      metadata: {
        amount: saved.record.amount || 'payer-selected',
        network: saved.record.network,
        mode: saved.record.mode,
      },
    })
    return res.json({ ok: true, request: publicRequest(saved.record), botPayload: `share_${saved.record.id}`, replayed: saved.replayed })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Telegram request failed'
    return res.status(500).json({ ok: false, error: message })
  }
}
