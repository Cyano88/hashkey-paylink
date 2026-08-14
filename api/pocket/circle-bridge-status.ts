import { CCTP_DOMAIN, type PocketBridgeNetwork } from './cctp.js'

export type CircleBridgeStatus = {
  status: string
  destinationTxHash?: string
}

export async function readCircleBridgeStatus(
  source: PocketBridgeNetwork,
  txHash: string,
  fetcher: typeof fetch = fetch,
): Promise<CircleBridgeStatus> {
  const response = await fetcher(`https://iris-api.circle.com/v2/messages/${CCTP_DOMAIN[source]}?transactionHash=${encodeURIComponent(txHash)}`)
  const data = await response.json().catch(() => ({})) as { messages?: Array<Record<string, unknown>> }
  if (!response.ok && response.status !== 404) throw new Error('Circle bridge status is temporarily unavailable.')
  const message = data.messages?.[0]
  return {
    status: String(message?.forwardState ?? message?.status ?? 'pending').toLowerCase(),
    destinationTxHash: typeof message?.forwardTxHash === 'string' ? message.forwardTxHash : undefined,
  }
}

export function isCircleBridgeComplete(status: string) {
  return status === 'confirmed' || status === 'complete'
}
