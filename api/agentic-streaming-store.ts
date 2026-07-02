import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { readDurableJson, writeDurableJson } from './render-durable-store.js'

const STORE_PATH = process.env.AGENTIC_STREAMING_STORE ?? './data/agentic-streaming-subscriptions.json'
const AGENTIC_STREAMING_STORE_KEY = (process.env.AGENTIC_STREAMING_STORE_KEY ?? 'hashpaylink:agentic-streaming').trim()

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

export async function readAgenticStreamingStore(): Promise<AgenticStreamingStore> {
  try {
    const remote = await readDurableJson<Partial<AgenticStreamingStore>>(AGENTIC_STREAMING_STORE_KEY)
    if (remote) return { subscriptions: remote.subscriptions ?? {}, deliveries: remote.deliveries ?? [] }
  } catch (error) {
    console.warn('[agentic-streaming] durable load failed; using file fallback.', error instanceof Error ? error.message : String(error))
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
    await writeDurableJson(AGENTIC_STREAMING_STORE_KEY, normalized)
  } catch (error) {
    console.warn('[agentic-streaming] durable save failed; file fallback was saved.', error instanceof Error ? error.message : String(error))
  }
}

export async function appendAgenticStreamingDelivery(delivery: AgenticStreamingDelivery) {
  const store = await readAgenticStreamingStore()
  const existing = store.subscriptions[delivery.subscriptionId]
  if (existing && delivery.status !== 'skipped') {
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
