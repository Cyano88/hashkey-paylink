import { POCKET_API, createPocketIdempotencyKey } from '../lib/pocketSchemas'

export type PocketBankWithdrawData = {
  intentId: string
  orderId: string
  merchantId: string
  amountNgn: string
  amountUsdc: string
  receiveAddress: string
  txHash: string
  providerStatus: string
  state: 'processing' | 'sent' | 'refunded' | 'failed'
  bankName: string
  bankLast4: string
  accountName: string
  validUntil: string
  executionId: string
  executionState: string
}

export type PocketBankWithdrawRouteData = {
  intentId: string
  phase: 'started' | 'submitted' | 'completed' | 'failed'
  source: 'arbitrum' | 'solana'
  destination: 'base'
  amount: string
  txHash: string
  claimed?: boolean
  updatedAt: number
}

function parseData(value: unknown): PocketBankWithdrawData {
  if (!value || typeof value !== 'object' || (value as any).ok !== true || !(value as any).data) {
    throw new Error(typeof (value as any)?.error === 'string' ? (value as any).error : 'Bank payout failed.')
  }
  const data = (value as any).data
  if (!data.intentId || !data.orderId || !data.amountUsdc || !data.receiveAddress || !['processing', 'sent', 'refunded', 'failed'].includes(data.state)) {
    throw new Error('Bank payout response was invalid.')
  }
  return data as PocketBankWithdrawData
}

async function mutate({ accessToken, body, idempotencyKey, fetcher = fetch }: { accessToken: string; body: Record<string, unknown>; idempotencyKey?: string; fetcher?: typeof fetch }) {
  const response = await fetcher(POCKET_API.bankWithdraw, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(typeof (data as any)?.error === 'string' ? (data as any).error : 'Bank payout failed.')
  return parseData(data)
}

export function preparePocketBankWithdraw(input: {
  accessToken: string
  request: Record<string, unknown>
  idempotencyKey?: string
  fetcher?: typeof fetch
}) {
  return mutate({ ...input, idempotencyKey: input.idempotencyKey ?? createPocketIdempotencyKey('bank-withdraw'), body: { action: 'prepare', ...input.request } })
}

export function confirmPocketBankWithdraw(input: { accessToken: string; request: Record<string, unknown>; fetcher?: typeof fetch }) {
  return mutate({ ...input, body: { action: 'confirm', ...input.request } })
}

export function authorizePocketBankWithdraw(input: { accessToken: string; request: Record<string, unknown>; fetcher?: typeof fetch }) {
  return mutate({ ...input, body: { action: 'authorize', ...input.request } })
}

export function readPocketBankWithdrawStatus(input: { accessToken: string; intentId: string; fetcher?: typeof fetch }) {
  return mutate({ ...input, body: { action: 'status', intent_id: input.intentId } })
}

export async function recoverPocketBankWithdrawals({ accessToken, fetcher = fetch }: { accessToken: string; fetcher?: typeof fetch }) {
  const response = await fetcher(POCKET_API.bankWithdraw, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ action: 'recover' }),
  })
  const value = await response.json().catch(() => undefined) as any
  if (!response.ok || value?.ok !== true || !Array.isArray(value?.data)) {
    throw new Error(typeof value?.error === 'string' ? value.error : 'Could not recover bank payouts.')
  }
  return value.data as Array<{ intentId: string; executionId: string; state: string; updatedAt: number }>
}

async function routeRequest({ accessToken, body, fetcher = fetch }: { accessToken: string; body: Record<string, unknown>; fetcher?: typeof fetch }) {
  const response = await fetcher(POCKET_API.bankWithdraw, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  })
  const value = await response.json().catch(() => undefined) as any
  if (!response.ok || value?.ok !== true) throw new Error(typeof value?.error === 'string' ? value.error : 'Bank payout routing failed.')
  return (value.data ?? null) as PocketBankWithdrawRouteData | null
}

export function readPocketBankWithdrawRoute(input: { accessToken: string; intentId: string; fetcher?: typeof fetch }) {
  return routeRequest({ ...input, body: { action: 'routeStatus', intent_id: input.intentId } })
}

export function startPocketBankWithdrawRoute(input: { accessToken: string; intentId: string; source: 'arbitrum' | 'solana'; amount: string; fetcher?: typeof fetch }) {
  return routeRequest({ ...input, body: { action: 'routeStart', intent_id: input.intentId, source: input.source, destination: 'base', amount: input.amount } })
}

export function updatePocketBankWithdrawRoute(input: { accessToken: string; intentId: string; phase: 'submitted' | 'completed' | 'failed'; txHash?: string; fetcher?: typeof fetch }) {
  return routeRequest({ ...input, body: { action: 'routeUpdate', intent_id: input.intentId, phase: input.phase, tx_hash: input.txHash ?? '' } })
}
