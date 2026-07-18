import { createPocketIdempotencyKey, POCKET_API } from '../lib/pocketSchemas'

export type PocketMarketplaceService = {
  resource: string
  provider: string
  description: string
  category: string
  method: 'GET'
  amount: string
  amountAtomic: string
  network: 'circle-gateway-mainnet'
}

export type PocketMarketplaceActivity = {
  id: string
  title: string
  amount?: string
  asset?: string
  serviceUrl?: string
  createdAt: number
  transaction?: string
}

export type PocketMarketplaceSnapshot = {
  services: PocketMarketplaceService[]
  activity: PocketMarketplaceActivity[]
  catalogAvailable: boolean
  catalogMessage?: string
  paymentNetwork: 'circle-gateway-mainnet'
  arcMarketplaceSupported: boolean
  maxPurchaseUsdc: string
  latestPurchase?: PocketMarketplacePurchase
}

export type PocketMarketplacePurchase = {
  status: 'completed' | 'processing' | 'paid' | 'needs_review'
  replayed: boolean
  message?: string
  service?: PocketMarketplaceService
  receiptActivityId?: string
  transaction?: string
  result?: unknown
}

function purchase(value: unknown): PocketMarketplacePurchase | undefined {
  const item = record(value)
  if (!item || !['completed', 'processing', 'paid', 'needs_review'].includes(String(item.status ?? ''))) return undefined
  return {
    status: item.status as PocketMarketplacePurchase['status'],
    replayed: item.replayed === true,
    ...(typeof item.message === 'string' ? { message: item.message } : {}),
    ...(service(item.service) ? { service: service(item.service) } : {}),
    ...(typeof item.receiptActivityId === 'string' ? { receiptActivityId: item.receiptActivityId } : {}),
    ...(typeof item.transaction === 'string' ? { transaction: item.transaction } : {}),
    ...(item.result !== undefined ? { result: item.result } : {}),
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function errorMessage(value: unknown) {
  const root = record(value)
  const error = record(root?.error)
  return typeof error?.message === 'string' ? error.message : 'Circle Marketplace is temporarily unavailable.'
}

function service(value: unknown): PocketMarketplaceService | undefined {
  const item = record(value)
  if (
    typeof item?.resource !== 'string'
    || typeof item.provider !== 'string'
    || typeof item.description !== 'string'
    || typeof item.category !== 'string'
    || item.method !== 'GET'
    || typeof item.amount !== 'string'
    || typeof item.amountAtomic !== 'string'
    || item.network !== 'circle-gateway-mainnet'
  ) return undefined
  return item as PocketMarketplaceService
}

export async function readPocketMarketplace({
  accessToken,
  query = '',
  fetcher = fetch,
}: {
  accessToken: string
  query?: string
  fetcher?: typeof fetch
}): Promise<PocketMarketplaceSnapshot> {
  const url = new URL(POCKET_API.marketplace, window.location.origin)
  if (query.trim()) url.searchParams.set('query', query.trim())
  const response = await fetcher(`${url.pathname}${url.search}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(errorMessage(data))
  const root = record(data)
  const services = Array.isArray(root?.services) ? root.services.map(service).filter(Boolean) as PocketMarketplaceService[] : []
  const activity = Array.isArray(root?.activity)
    ? root.activity.flatMap(value => {
        const item = record(value)
        if (!item || typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.createdAt !== 'number') return []
        return [item as PocketMarketplaceActivity]
      })
    : []
  const latestPurchase = purchase(root?.latestPurchase)
  return {
    services,
    activity,
    catalogAvailable: root?.catalogAvailable !== false,
    ...(typeof root?.catalogMessage === 'string' ? { catalogMessage: root.catalogMessage } : {}),
    paymentNetwork: 'circle-gateway-mainnet',
    arcMarketplaceSupported: root?.arcMarketplaceSupported === true,
    maxPurchaseUsdc: typeof root?.maxPurchaseUsdc === 'string' ? root.maxPurchaseUsdc : '0.05',
    ...(latestPurchase ? { latestPurchase } : {}),
  }
}

export async function buyPocketMarketplaceService({
  accessToken,
  selected,
  idempotencyKey = createPocketIdempotencyKey('marketplace'),
  fetcher = fetch,
}: {
  accessToken: string
  selected: PocketMarketplaceService
  idempotencyKey?: string
  fetcher?: typeof fetch
}): Promise<PocketMarketplacePurchase> {
  const response = await fetcher(POCKET_API.marketplace, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({ resource: selected.resource, maxAmount: selected.amount }),
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(errorMessage(data))
  const root = record(data)
  const parsed = purchase(root)
  if (!parsed || (parsed.status !== 'completed' && parsed.status !== 'processing')) throw new Error('Circle Marketplace returned an invalid purchase response.')
  return parsed
}
