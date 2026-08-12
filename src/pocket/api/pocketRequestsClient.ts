import { POCKET_API } from '../lib/pocketSchemas'

export type PocketRequestItem = { id: string; eventId: string; direction: 'incoming' | 'outgoing'; senderPocketId: string; senderName: string; recipientPocketId: string; title: string; amount: string; flexibleAmount: boolean; network: 'base' | 'arbitrum' | 'solana' | 'multi'; paymentUrl: string; status: 'pending' | 'accepted' | 'declined' | 'paid'; createdAt: number; updatedAt: number }
const message = (data: unknown, fallback: string) => typeof data === 'object' && data && typeof (data as { error?: { message?: unknown } }).error?.message === 'string' ? (data as { error: { message: string } }).error.message : fallback
async function call(accessToken: string, body?: Record<string, unknown>) {
  const response = await fetch(POCKET_API.requests, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + accessToken, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const data = await response.json().catch(() => undefined) as { ok?: boolean; request?: PocketRequestItem; requests?: PocketRequestItem[] } | undefined
  if (!response.ok || !data?.ok) throw new Error(message(data, 'Pocket request failed.'))
  return data
}
export async function createPocketUserRequest(input: { accessToken: string; recipientPocketId: string; eventId: string; title: string; amount: string; flexibleAmount: boolean; network: PocketRequestItem['network']; paymentUrl: string }) { const data = await call(input.accessToken, { action: 'create', recipientPocketId: input.recipientPocketId, eventId: input.eventId, title: input.title, amount: input.amount, flexibleAmount: input.flexibleAmount, network: input.network, paymentUrl: input.paymentUrl }); if (!data.request) throw new Error('Pocket request response was invalid.'); return data.request }
export async function readPocketRequests(accessToken: string) { const data = await call(accessToken); return data.requests ?? [] }
export async function decidePocketRequest(accessToken: string, id: string, decision: 'accept' | 'decline') { const data = await call(accessToken, { action: decision, id }); if (!data.request) throw new Error('Pocket request response was invalid.'); return data.request }
