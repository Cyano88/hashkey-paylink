import { POCKET_API } from '../lib/pocketSchemas'

export type PocketBridgeNetwork = 'base' | 'arbitrum' | 'solana'
export type PocketBridgeQuote = {
  source: PocketBridgeNetwork
  destination: PocketBridgeNetwork
  amount: string
  fee: string
  total: string
  receive: string
  destinationAddress: string
  expiresAt: number
}

function message(data: any) {
  return data?.error?.message || data?.error || 'Bridge request failed.'
}

export async function readPocketBridgeQuote(input: { accessToken: string; source: PocketBridgeNetwork; destination: PocketBridgeNetwork; amount: string; fetcher?: typeof fetch }) {
  const response = await (input.fetcher ?? fetch)(POCKET_API.bridge, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${input.accessToken}` },
    body: JSON.stringify({ action: 'quote', source: input.source, destination: input.destination, amount: input.amount }),
  })
  const data = await response.json().catch(() => ({})) as { ok?: boolean; quote?: PocketBridgeQuote; error?: unknown }
  if (!response.ok || data.ok !== true || !data.quote) throw new Error(message(data))
  return data.quote
}

export async function readPocketBridgeStatus(input: { accessToken: string; source: PocketBridgeNetwork; txHash: string; fetcher?: typeof fetch }) {
  const query = new URLSearchParams({ action: 'status', source: input.source, txHash: input.txHash })
  const response = await (input.fetcher ?? fetch)(`${POCKET_API.bridge}?${query}`, { headers: { authorization: `Bearer ${input.accessToken}` } })
  const data = await response.json().catch(() => ({})) as { ok?: boolean; status?: string; destinationTxHash?: string; error?: unknown }
  if (!response.ok || data.ok !== true) throw new Error(message(data))
  return data
}

export async function recordPocketBridge(input: { accessToken: string; source: PocketBridgeNetwork; destination: PocketBridgeNetwork; amount: string; txHash: string; status: 'submitted' | 'completed'; fetcher?: typeof fetch }) {
  const response = await (input.fetcher ?? fetch)(POCKET_API.bridge, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${input.accessToken}` },
    body: JSON.stringify({ action: 'record', source: input.source, destination: input.destination, amount: input.amount, txHash: input.txHash, status: input.status }),
  })
  const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: unknown }
  if (!response.ok || data.ok !== true) throw new Error(message(data))
}
