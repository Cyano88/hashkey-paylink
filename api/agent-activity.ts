import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import crypto from 'node:crypto'
import { archivePayment } from './og-storage.js'

const STORE_PATH = process.env.AGENT_WALLET_PROVISION_STORE ?? './data/agent-wallet-provisioning.json'

export type AgentActivityType =
  | 'wallet_connected'
  | 'funded'
  | 'gateway_activated'
  | 'x402_spent'
  | 'x402_sold'
  | 'scout_returned'
  | 'governance'

export type AgentActivityProof = {
  kind: 'circle_gateway_x402'
  provider?: string
  service?: string
  buyerAgent?: string
  sellerAgent?: string
  payer?: string
  seller?: string
  amount?: string
  network?: string
  transaction?: string
  serviceUrl?: string
  generatedAt?: string
  receiptHash?: string
  circleOutputHash?: string
  proofHash: string
  legal?: Record<string, unknown>
  governance?: Record<string, unknown>
}

export type AgentActivityOgProof = {
  rootHash: string
  ogTxHash: string
  ogExplorer: string
  archivedAt: number
}

export type AgentActivity = {
  id: string
  agentSlug: string
  type: AgentActivityType
  title: string
  amount?: string
  asset?: string
  direction?: 'in' | 'out' | 'result' | 'system'
  network?: string
  wallet?: string
  txHash?: string
  serviceUrl?: string
  detail?: string
  result?: Record<string, unknown>
  proof?: AgentActivityProof
  og?: AgentActivityOgProof
  createdAt: number
}

type ActivityStore = {
  pending?: Record<string, unknown>
  agents?: Record<string, unknown>
  activity?: Record<string, AgentActivity[]>
}

export function normalizeActivitySlug(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 32)
}

async function readActivityStore(): Promise<ActivityStore> {
  try {
    return JSON.parse(await readFile(STORE_PATH, 'utf8')) as ActivityStore
  } catch {
    return { pending: {}, agents: {}, activity: {} }
  }
}

async function writeActivityStore(data: ActivityStore) {
  await mkdir(dirname(STORE_PATH), { recursive: true })
  await writeFile(STORE_PATH, JSON.stringify(data, null, 2))
}

function shouldArchiveActivity(item: AgentActivity) {
  return !!item.txHash || !!item.proof?.proofHash
}

async function patchActivityOgProof(agentSlug: string, activityId: string, og: AgentActivityOgProof) {
  const store = await readActivityStore()
  const slug = normalizeActivitySlug(agentSlug)
  const items = store.activity?.[slug]
  if (!items?.length) return
  const index = items.findIndex(item => item.id === activityId)
  if (index === -1) return
  items[index] = { ...items[index], og }
  await writeActivityStore(store)
}

async function archiveAgentActivity(item: AgentActivity) {
  if (!shouldArchiveActivity(item) || item.og) return
  const result = await archivePayment({
    eventId: `agent:${item.agentSlug}:${item.id}`,
    txHash: item.txHash || item.proof?.transaction || item.proof?.proofHash || item.id,
    chain: item.network || item.proof?.network || 'agentic',
    payer: item.wallet || item.proof?.payer || item.agentSlug,
    amount: item.amount ? `${item.amount} ${item.asset ?? 'USDC'}` : item.title,
    ts: item.createdAt,
    metadata: {
      type: 'hashpaylink_agent_activity',
      activity: item,
    },
  })
  if (!result) return
  await patchActivityOgProof(item.agentSlug, item.id, {
    rootHash: result.rootHash,
    ogTxHash: result.ogTxHash,
    ogExplorer: `https://chainscan.0g.ai/tx/${result.ogTxHash}`,
    archivedAt: Date.now(),
  })
}

export async function ensureAgentActivityArchived(activityId: string) {
  const found = await findAgentActivity(activityId)
  if (!found || found.og || !shouldArchiveActivity(found)) return found
  await archiveAgentActivity(found)
  return findAgentActivity(activityId)
}

export async function listAgentActivity(agentSlug: string, limit = 12) {
  const slug = normalizeActivitySlug(agentSlug)
  if (!slug) return []
  const store = await readActivityStore()
  return [...(store.activity?.[slug] ?? [])]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
}

export async function findAgentActivity(activityId: string) {
  const id = String(activityId ?? '').trim()
  if (!id) return undefined
  const store = await readActivityStore()
  for (const [agentSlug, items] of Object.entries(store.activity ?? {})) {
    const found = items.find(item => item.id === id)
    if (found) return { ...found, agentSlug }
  }
  return undefined
}

export async function appendAgentActivity(input: Omit<AgentActivity, 'id' | 'createdAt'> & { createdAt?: number }) {
  const slug = normalizeActivitySlug(input.agentSlug)
  if (!slug) return undefined
  const store = await readActivityStore()
  const next: AgentActivity = {
    ...input,
    agentSlug: slug,
    id: crypto.randomUUID(),
    createdAt: input.createdAt ?? Date.now(),
  }
  store.activity = store.activity ?? {}
  const existing = store.activity[slug] ?? []
  const isDuplicate = existing.some(item => (
    (input.txHash && item.txHash?.toLowerCase() === input.txHash.toLowerCase() && item.type === input.type)
    || (input.proof?.proofHash && item.proof?.proofHash === input.proof.proofHash && item.type === input.type)
  ))
  if (isDuplicate) {
    const duplicate = existing.find(item => (
      (input.txHash && item.txHash?.toLowerCase() === input.txHash.toLowerCase() && item.type === input.type)
      || (input.proof?.proofHash && item.proof?.proofHash === input.proof.proofHash && item.type === input.type)
    ))
    if (duplicate && shouldArchiveActivity(duplicate) && !duplicate.og) {
      void archiveAgentActivity(duplicate).catch(() => {})
    }
    return duplicate
  }
  store.activity[slug] = [next, ...existing].slice(0, 80)
  await writeActivityStore(store)
  void archiveAgentActivity(next).catch(() => {})
  return next
}
