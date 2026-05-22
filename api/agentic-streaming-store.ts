import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const STORE_PATH = process.env.AGENTIC_STREAMING_STORE ?? './data/agentic-streaming-subscriptions.json'
const UPSTASH_REST_URL = (process.env.UPSTASH_REDIS_REST_URL ?? '').trim().replace(/\/+$/, '')
const UPSTASH_REST_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN ?? '').trim()
const UPSTASH_STORE_KEY = (process.env.AGENTIC_STREAMING_STORE_KEY ?? 'hashpaylink:agentic-streaming').trim()

export type AgenticStreamingDelivery = {
  id: string
  subscriptionId: string
  status: 'sent' | 'failed' | 'skipped'
  email: string
  generatedAt: number
  dryRun?: boolean
  error?: string
  scoutSummary?: string
  topTitles?: string[]
}

export type AgenticStreamingSubscription = {
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
  lastReportAt?: number
  lastReportStatus?: AgenticStreamingDelivery['status']
  lastReportError?: string
}

export type AgenticStreamingStore = {
  subscriptions: Record<string, AgenticStreamingSubscription>
  deliveries?: AgenticStreamingDelivery[]
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

export async function readAgenticStreamingStore(): Promise<AgenticStreamingStore> {
  try {
    const remote = await upstashCommand<string>(['GET', UPSTASH_STORE_KEY])
    if (remote) return JSON.parse(remote) as AgenticStreamingStore
  } catch (error) {
    console.warn('[agentic-streaming] Upstash load failed; using file fallback.', error instanceof Error ? error.message : String(error))
  }

  try {
    return JSON.parse(await readFile(STORE_PATH, 'utf8')) as AgenticStreamingStore
  } catch {
    return { subscriptions: {}, deliveries: [] }
  }
}

export async function writeAgenticStreamingStore(store: AgenticStreamingStore) {
  const normalized = { subscriptions: store.subscriptions ?? {}, deliveries: (store.deliveries ?? []).slice(-200) }
  await mkdir(dirname(STORE_PATH), { recursive: true })
  await writeFile(STORE_PATH, JSON.stringify(normalized, null, 2))
  try {
    await upstashCommand(['SET', UPSTASH_STORE_KEY, JSON.stringify(normalized)])
  } catch (error) {
    console.warn('[agentic-streaming] Upstash save failed; file fallback was saved.', error instanceof Error ? error.message : String(error))
  }
}

export async function appendAgenticStreamingDelivery(delivery: AgenticStreamingDelivery) {
  const store = await readAgenticStreamingStore()
  const existing = store.subscriptions[delivery.subscriptionId]
  if (existing) {
    store.subscriptions[delivery.subscriptionId] = {
      ...existing,
      lastReportAt: delivery.generatedAt,
      lastReportStatus: delivery.status,
      lastReportError: delivery.error,
      updatedAt: Date.now(),
    }
  }
  store.deliveries = [...(store.deliveries ?? []), delivery].slice(-200)
  await writeAgenticStreamingStore(store)
  return delivery
}
