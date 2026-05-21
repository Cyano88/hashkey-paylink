import type { Request, Response } from 'express'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { isAddress } from 'viem'

const STORE_PATH = process.env.AGENTIC_STREAMING_STORE ?? './data/agentic-streaming-subscriptions.json'
const SERVICES = new Set(['polymarket-lp'])

type Subscription = {
  id: string
  service: string
  vault: string
  streamUrl: string
  agentSlug: string
  agentWallet: string
  senderWallet?: string
  reportEmail: string
  amountPerDay: string
  totalAmount: string
  duration: string
  reason: string
  source: string
  createdAt: number
  updatedAt: number
  status: 'active'
}

type Store = {
  subscriptions: Record<string, Subscription>
}

function normalizeEmail(value: unknown) {
  const email = String(value ?? '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function cleanText(value: unknown, fallback = '') {
  return String(value ?? fallback).trim().slice(0, 180)
}

function cleanUrl(value: unknown) {
  return String(value ?? '').trim().slice(0, 500)
}

function cleanAmount(value: unknown) {
  const raw = String(value ?? '').trim()
  return /^(?:\d+|\d*\.\d{1,6})$/.test(raw) && Number(raw) > 0 ? raw : ''
}

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await readFile(STORE_PATH, 'utf8')) as Store
  } catch {
    return { subscriptions: {} }
  }
}

async function writeStore(store: Store) {
  await mkdir(dirname(STORE_PATH), { recursive: true })
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2))
}

export default async function handler(req: Request, res: Response) {
  if (req.method === 'GET') {
    const store = await readStore()
    const service = cleanText(req.query.service)
    const rows = Object.values(store.subscriptions)
      .filter(item => !service || item.service === service)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
    return res.json({ ok: true, subscriptions: rows })
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const service = cleanText(req.body?.service || 'polymarket-lp')
  const vault = cleanText(req.body?.vault)
  const agentWallet = cleanText(req.body?.agentWallet)
  const senderWallet = cleanText(req.body?.senderWallet)
  const reportEmail = normalizeEmail(req.body?.reportEmail)
  const amountPerDay = cleanAmount(req.body?.amountPerDay)
  const totalAmount = cleanAmount(req.body?.totalAmount)
  const duration = cleanText(req.body?.duration)
  const streamUrl = cleanUrl(req.body?.streamUrl)

  if (!SERVICES.has(service)) return res.status(400).json({ ok: false, error: 'Unsupported agentic streaming service.' })
  if (!isAddress(vault)) return res.status(400).json({ ok: false, error: 'Invalid stream vault.' })
  if (!isAddress(agentWallet)) return res.status(400).json({ ok: false, error: 'Invalid agent wallet.' })
  if (senderWallet && !isAddress(senderWallet)) return res.status(400).json({ ok: false, error: 'Invalid sender wallet.' })
  if (!reportEmail) return res.status(400).json({ ok: false, error: 'Invalid report email.' })
  if (!amountPerDay || !totalAmount) return res.status(400).json({ ok: false, error: 'Invalid stream amount.' })
  if (!/^\d+[dhw]$/.test(duration)) return res.status(400).json({ ok: false, error: 'Invalid stream duration.' })
  if (!streamUrl) return res.status(400).json({ ok: false, error: 'Missing stream URL.' })

  const now = Date.now()
  const store = await readStore()
  const existing = store.subscriptions[vault.toLowerCase()]
  const subscription: Subscription = {
    id: vault.toLowerCase(),
    service,
    vault,
    streamUrl,
    agentSlug: cleanText(req.body?.agentSlug || 'hashpaylink-agent', 'hashpaylink-agent'),
    agentWallet,
    senderWallet: senderWallet || undefined,
    reportEmail,
    amountPerDay,
    totalAmount,
    duration,
    reason: cleanText(req.body?.reason || 'Polymarket LP research', 'Polymarket LP research'),
    source: cleanText(req.body?.source || 'streampay', 'streampay'),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    status: 'active',
  }
  store.subscriptions[subscription.id] = subscription
  await writeStore(store)
  return res.json({ ok: true, subscription })
}
