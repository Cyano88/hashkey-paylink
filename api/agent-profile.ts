import type { Request, Response } from 'express'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import crypto from 'node:crypto'

const STORE_PATH = process.env.AGENT_PROFILE_STORE
  ?? (process.env.DATA_PATH ? `${process.env.DATA_PATH}/agent-profiles.json` : './data/agent-profiles.json')
const UPSTASH_REST_URL = (process.env.UPSTASH_REDIS_REST_URL ?? '').trim().replace(/\/+$/, '')
const UPSTASH_REST_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN ?? '').trim()
const UPSTASH_STORE_KEY = (process.env.AGENT_PROFILE_STORE_KEY ?? 'hashpaylink:agent-profiles').trim()
const PLATFORM_AGENT_SLUG = (process.env.DEFAULT_AGENT_SLUG ?? '').trim().toLowerCase() || 'hashpaylink-agent'
const PLATFORM_AGENT_WALLET_ADDRESS = (process.env.DEFAULT_AGENT_WALLET_ADDRESS ?? '').trim()
const MAX_OWNER_AGENTS = 3

export type AgentProfile = {
  slug: string
  name: string
  purpose: string
  ownerKey: string
  walletAddress?: string
  createdAt: number
  updatedAt: number
}

type Store = {
  agents: Record<string, AgentProfile>
}

function publicAgent(agent: AgentProfile) {
  return {
    slug: agent.slug,
    name: agent.name,
    purpose: agent.purpose,
    walletAddress: agent.walletAddress,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  }
}

function platformAgentProfile(): AgentProfile {
  return {
    slug: PLATFORM_AGENT_SLUG,
    name: 'Hash PayLink Agent',
    purpose: 'Owner-managed platform agent for treasury, x402, LP Scout, and StreamPay services.',
    ownerKey: 'platform',
    walletAddress: PLATFORM_AGENT_WALLET_ADDRESS || undefined,
    createdAt: 0,
    updatedAt: 0,
  }
}

function cleanString(value: unknown, max = 256) {
  return String(value ?? '').trim().slice(0, max)
}

function slugify(value: string) {
  const base = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42)
  return base || `agent-${Date.now().toString(36)}`
}

function ownerKey(value: unknown) {
  const raw = cleanString(value, 160).toLowerCase()
  if (!raw) return ''
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32)
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
    console.warn('[agent-profile] Upstash load failed; using file fallback.', err instanceof Error ? err.message : String(err))
  }

  try {
    return JSON.parse(await readFile(STORE_PATH, 'utf8')) as Store
  } catch {
    return { agents: {} }
  }
}

async function writeStore(store: Store) {
  await mkdir(dirname(STORE_PATH), { recursive: true })
  const serialized = JSON.stringify(store, null, 2)
  await writeFile(STORE_PATH, serialized, 'utf8')
  try {
    await upstashCommand(['SET', UPSTASH_STORE_KEY, JSON.stringify(store)])
  } catch (err) {
    console.warn('[agent-profile] Upstash save failed; file fallback saved.', err instanceof Error ? err.message : String(err))
  }
}

function visibleAgents(store: Store, key: string) {
  return Object.values(store.agents)
    .filter(agent => agent.ownerKey === key)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

async function migrateVisibleAgents(store: Store, fromKey: string, toKey: string) {
  if (!fromKey || !toKey || fromKey === toKey) return []
  const agents = visibleAgents(store, fromKey)
  if (!agents.length) return []
  const now = Date.now()
  for (const agent of agents) {
    store.agents[agent.slug] = {
      ...agent,
      ownerKey: toKey,
      updatedAt: now,
    }
  }
  await writeStore(store)
  return visibleAgents(store, toKey)
}

export async function setAgentProfileWallet(slug: string, walletAddress: string) {
  const cleanSlug = slugify(slug)
  const cleanWallet = cleanString(walletAddress, 80)
  if (!cleanSlug) return
  const store = await readStore()
  const agent = store.agents[cleanSlug]
  if (!agent) return
  agent.walletAddress = cleanWallet || undefined
  agent.updatedAt = Date.now()
  store.agents[cleanSlug] = agent
  await writeStore(store)
}

export default async function handler(req: Request, res: Response) {
  if (req.method === 'GET') {
    const slug = cleanString(req.query.slug ?? req.query.agent, 80)
    if (slug) {
      if (slug.toLowerCase() === PLATFORM_AGENT_SLUG) {
        return res.json({ ok: true, agent: publicAgent(platformAgentProfile()) })
      }

      const store = await readStore()
      const agent = store.agents[slug]
      if (!agent) return res.status(404).json({ ok: false, error: 'Agent profile not found.' })
      return res.json({ ok: true, agent: publicAgent(agent) })
    }

    const store = await readStore()
    const key = ownerKey(req.query.owner)
    if (!key) return res.status(400).json({ ok: false, error: 'Missing owner.' })
    const agents = visibleAgents(store, key)
    if (agents.length) return res.json({ ok: true, agents })
    const fallbackKey = ownerKey(req.query.fallbackOwner)
    const migrated = await migrateVisibleAgents(store, fallbackKey, key)
    return res.json({ ok: true, agents: migrated })
  }

  if (req.method === 'DELETE') {
    const key = ownerKey(req.body?.owner ?? req.query.owner)
    const slug = slugify(cleanString(req.body?.slug ?? req.query.slug ?? req.query.agent, 80))
    if (!key) return res.status(400).json({ ok: false, error: 'Missing owner.' })
    if (!slug) return res.status(400).json({ ok: false, error: 'Missing agent.' })
    if (slug === PLATFORM_AGENT_SLUG) return res.status(403).json({ ok: false, error: 'Platform agent cannot be deleted.' })

    const store = await readStore()
    const existing = store.agents[slug]
    if (!existing) return res.status(404).json({ ok: false, error: 'Agent profile not found.' })
    if (existing.ownerKey !== key) return res.status(403).json({ ok: false, error: 'Agent profile does not belong to this user.' })
    delete store.agents[slug]
    await writeStore(store)
    return res.json({ ok: true, agents: visibleAgents(store, key) })
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const key = ownerKey(req.body?.owner)
  const name = cleanString(req.body?.name, 80)
  const purpose = cleanString(req.body?.purpose, 260)
  if (!key) return res.status(400).json({ ok: false, error: 'Missing owner.' })
  if (name.length < 2) return res.status(400).json({ ok: false, error: 'Enter an agent name.' })
  if (purpose.length < 6) return res.status(400).json({ ok: false, error: 'Enter a clear purpose.' })

  const store = await readStore()
  const desiredSlug = slugify(cleanString(req.body?.slug, 64) || name)
  let slug = desiredSlug
  let suffix = 2
  while (store.agents[slug] && store.agents[slug].ownerKey !== key) {
    slug = `${desiredSlug}-${suffix}`
    suffix += 1
  }

  const existing = store.agents[slug]
  if (!existing && visibleAgents(store, key).length >= MAX_OWNER_AGENTS) {
    return res.status(400).json({ ok: false, error: `You can create up to ${MAX_OWNER_AGENTS} agents.` })
  }
  const now = Date.now()
  const agent: AgentProfile = {
    slug,
    name,
    purpose,
    ownerKey: key,
    walletAddress: cleanString(req.body?.walletAddress, 80) || existing?.walletAddress,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  store.agents[slug] = agent
  await writeStore(store)
  return res.json({ ok: true, agent, agents: visibleAgents(store, key) })
}
