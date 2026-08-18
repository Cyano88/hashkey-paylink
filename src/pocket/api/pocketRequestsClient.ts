import type { PocketPaymentLiquidityCheckpoint } from '../controllers/usePocketPaymentLiquidityController'
import { POCKET_API } from '../lib/pocketSchemas'

export type PocketRequestItem = { id: string; eventId: string; direction: 'incoming' | 'outgoing'; senderPocketId: string; senderName: string; recipientPocketId: string; recipientName: string; title: string; amount: string; flexibleAmount: boolean; network: 'base' | 'arbitrum' | 'solana' | 'multi'; paymentPath: string; status: 'pending' | 'accepted' | 'declined' | 'paid'; transactionHash: string; createdAt: number; updatedAt: number }
export const POCKET_REQUESTS_UPDATED_EVENT = 'pocket:requests-updated'
function announcePocketRequestsUpdated() { window.dispatchEvent(new Event(POCKET_REQUESTS_UPDATED_EVENT)) }
const message = (data: unknown, fallback: string) => {
  if (!data || typeof data !== 'object') return fallback
  const error = (data as { error?: unknown }).error
  if (typeof error === 'string') return error
  return error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message
    : fallback
}
async function call(accessToken: string, body?: Record<string, unknown>) {
  const response = await fetch(POCKET_API.requests, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + accessToken, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const data = await response.json().catch(() => undefined) as { ok?: boolean; request?: PocketRequestItem; requests?: PocketRequestItem[]; unreadCount?: number; route?: PocketPaymentLiquidityCheckpoint } | undefined
  if (!response.ok || !data?.ok) throw new Error(message(data, 'Requests are temporarily unavailable. Try again shortly.'))
  return data
}
export async function createPocketUserRequest(input: { accessToken: string; recipientPocketId: string; eventId: string; title: string; amount: string; network: Exclude<PocketRequestItem['network'], 'multi'> }) { const data = await call(input.accessToken, { action: 'create', recipientPocketId: input.recipientPocketId, eventId: input.eventId, title: input.title, amount: input.amount, network: input.network }); if (!data.request) throw new Error('Pocket request response was invalid.'); announcePocketRequestsUpdated(); return data.request }
export async function readPocketRequests(accessToken: string) { const data = await call(accessToken); return data.requests ?? [] }
export async function readPocketRequestInbox(accessToken: string) { const data = await call(accessToken); return { requests: data.requests ?? [], unreadCount: Number.isSafeInteger(data.unreadCount) ? data.unreadCount! : 0 } }
export async function markPocketRequestsRead(accessToken: string) { await call(accessToken, { action: 'mark-read' }); announcePocketRequestsUpdated() }
export async function decidePocketRequest(accessToken: string, id: string, decision: 'accept' | 'decline') { const data = await call(accessToken, { action: decision, id }); if (!data.request) throw new Error('Pocket request response was invalid.'); announcePocketRequestsUpdated(); return data.request }
export async function reconcilePocketRequest(accessToken: string, id: string) { const data = await call(accessToken, { action: 'reconcile', id }); if (!data.request) throw new Error('Pocket payment reconciliation was invalid.'); if (data.request.status === 'paid') announcePocketRequestsUpdated(); return data.request }
export async function completePocketRequest(accessToken: string, id: string, transactionHash: string) { const data = await call(accessToken, { action: 'complete', id, transactionHash }); if (!data.request) throw new Error('Pocket payment confirmation was invalid.'); announcePocketRequestsUpdated(); return data.request }
export async function readPocketRequestRoute(accessToken: string, id: string) { const data = await call(accessToken, { action: 'route-status', id }); return data.route ?? null }
export async function startPocketRequestRoute(accessToken: string, id: string, route: { source: PocketPaymentLiquidityCheckpoint['source']; destination: PocketPaymentLiquidityCheckpoint['destination']; amount: string }) { const data = await call(accessToken, { action: 'route-start', id, ...route }); if (!data.route) throw new Error('Pocket payment route response was invalid.'); return data.route }
export async function updatePocketRequestRoute(accessToken: string, id: string, route: { phase: 'submitted' | 'completed' | 'failed'; txHash?: string }) { const data = await call(accessToken, { action: 'route-update', id, phase: route.phase, transactionHash: route.txHash ?? '' }); return data.route ?? null }

export type PocketRequestUser = { pocketId: string; displayName: string; verified: boolean }
export async function resolvePocketRequestUser(accessToken: string, pocketId: string) {
  const response = await fetch(POCKET_API.requests, { method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'resolve-request-user', pocketId }) })
  const data = await response.json().catch(() => undefined) as { ok?: boolean; user?: PocketRequestUser } | undefined
  if (!response.ok || !data?.ok || !data.user) throw new Error(message(data, 'Pocket user could not be resolved.'))
  return data.user
}

export type PocketResolvedRecipient = { pocketId: string; name: string; network: 'base' | 'arbitrum' | 'solana'; address: string }
export async function resolvePocketRecipient(accessToken: string, pocketId: string, network: PocketResolvedRecipient['network']) {
  const response = await fetch(POCKET_API.requests, { method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'resolve-recipient', pocketId, network }) })
  const data = await response.json().catch(() => undefined) as { ok?: boolean; recipient?: PocketResolvedRecipient } | undefined
  if (!response.ok || !data?.ok || !data.recipient) throw new Error(message(data, 'Pocket user could not be resolved.'))
  return data.recipient
}
