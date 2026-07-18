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
  state: 'processing' | 'sent' | 'refunded'
  bankName: string
  bankLast4: string
  accountName: string
}

function parseData(value: unknown): PocketBankWithdrawData {
  if (!value || typeof value !== 'object' || (value as any).ok !== true || !(value as any).data) {
    throw new Error(typeof (value as any)?.error === 'string' ? (value as any).error : 'Bank payout failed.')
  }
  const data = (value as any).data
  if (!data.intentId || !data.orderId || !data.amountUsdc || !data.receiveAddress || !['processing', 'sent', 'refunded'].includes(data.state)) {
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

export function readPocketBankWithdrawStatus(input: { accessToken: string; intentId: string; fetcher?: typeof fetch }) {
  return mutate({ ...input, body: { action: 'status', intent_id: input.intentId } })
}
