import type { Request, Response } from 'express'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import crypto from 'node:crypto'
import { readDurableJson, writeDurableJson } from './render-durable-store.js'

const STORE_PATH = process.env.AGENT_PROFILE_STORE
  ?? (process.env.DATA_PATH ? `${process.env.DATA_PATH}/agent-profiles.json` : './data/agent-profiles.json')
const AGENT_PROFILE_STORE_KEY = (process.env.AGENT_PROFILE_STORE_KEY ?? 'hashpaylink:agent-profiles').trim()
const PLATFORM_AGENT_SLUG = (process.env.DEFAULT_AGENT_SLUG ?? '').trim().toLowerCase() || 'hashpaylink-agent'
const PLATFORM_AGENT_WALLET_ADDRESS = (process.env.DEFAULT_AGENT_WALLET_ADDRESS ?? '').trim()
const MAX_OWNER_AGENTS = 3

export type AgentProfile = {
  slug: string
  name: string
  purpose: string
  ownerKey: string
  walletAddress?: string
  profileImage?: AgentProfileImage
  createdAt: number
  updatedAt: number
}

type AgentProfileImage = {
  initials: string
  hue: number
  accentHue: number
}

type Store = {
  agents: Record<string, AgentProfile>
}

function profileInitials(name: string) {
  const parts = name.replace(/[^a-z0-9\s-]/gi, ' ').trim().split(/\s+/).filter(Boolean)
  const initials = parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join('')
  return initials || 'AG'
}

function agentProfileImage(slug: string, name: string): AgentProfileImage {
  const seed = `${slug}:${name}`
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  const hue = hash % 360
  return {
    initials: profileInitials(name),
    hue,
    accentHue: (hue + 44) % 360,
  }
}

function withProfileImage(agent: AgentProfile): AgentProfile {
  return {
    ...agent,
    profileImage: agent.profileImage ?? agentProfileImage(agent.slug, agent.name),
  }
}

function publicAgent(agent: AgentProfile) {
  const safeAgent = withProfileImage(agent)
  return {
    slug: safeAgent.slug,
    name: safeAgent.name,
    purpose: safeAgent.purpose,
    walletAddress: safeAgent.walletAddress,
    profileImage: safeAgent.profileImage,
    createdAt: safeAgent.createdAt,
    updatedAt: safeAgent.updatedAt,
  }
}

function platformAgentProfile(): AgentProfile {
  return {
    slug: PLATFORM_AGENT_SLUG,
    name: 'Hash PayLink Agent',
    purpose: 'Owner-managed platform agent for treasury, x402, LP Scout, and HashpayStream services.',
    ownerKey: 'platform',
    walletAddress: PLATFORM_AGENT_WALLET_ADDRESS || undefined,
    profileImage: agentProfileImage(PLATFORM_AGENT_SLUG, 'Hash PayLink Agent'),
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

async function readStore(): Promise<Store> {
  try {
    const remote = await readDurableJson<Partial<Store>>(AGENT_PROFILE_STORE_KEY)
    if (remote) return { agents: remote.agents ?? {} }
  } catch (err) {
    console.warn('[agent-profile] durable load failed; using file fallback.', err instanceof Error ? err.message : String(err))
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
    await writeDurableJson(AGENT_PROFILE_STORE_KEY, store)
  } catch (err) {
    console.warn('[agent-profile] durable save failed; file fallback saved.', err instanceof Error ? err.message : String(err))
  }
}

function visibleAgents(store: Store, key: string) {
  return Object.values(store.agents)
    .filter(agent => agent.ownerKey === key)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(withProfileImage)
}

function publicAgents(agents: AgentProfile[]) {
  return agents.map(publicAgent)
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
    if (agents.length) return res.json({ ok: true, agents: publicAgents(agents) })
    const fallbackKey = ownerKey(req.query.fallbackOwner)
    const migrated = await migrateVisibleAgents(store, fallbackKey, key)
    return res.json({ ok: true, agents: publicAgents(migrated) })
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
    return res.json({ ok: true, agents: publicAgents(visibleAgents(store, key)) })
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
    profileImage: existing?.profileImage ?? agentProfileImage(slug, name),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  store.agents[slug] = agent
  await writeStore(store)
  return res.json({ ok: true, agent: publicAgent(agent), agents: publicAgents(visibleAgents(store, key)) })
}
