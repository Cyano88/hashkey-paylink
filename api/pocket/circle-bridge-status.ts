import { CCTP_DOMAIN, type PocketBridgeNetwork } from './cctp.js'

export type CircleBridgeStatus = {
  status: string
  sourceConfirmed?: boolean
  destinationTxHash?: string
  message?:string
}

export async function readCircleBridgeStatus(
  source: PocketBridgeNetwork,
  txHash: string,
  fetcher: typeof fetch = fetch,
  owner?:{ownerId:string;destination:string;amount:string},
): Promise<CircleBridgeStatus> {
  const response = await fetcher(`https://iris-api.circle.com/v2/messages/${CCTP_DOMAIN[source]}?transactionHash=${encodeURIComponent(txHash)}`, {signal:AbortSignal.timeout(10_000)})
  const data = await response.json().catch(() => ({})) as { messages?: Array<Record<string, unknown>> }
  if (!response.ok && response.status !== 404) throw new Error('Circle bridge status is temporarily unavailable.')
  if (data.messages !== undefined && !Array.isArray(data.messages)) throw new Error('Circle bridge status is invalid.')
  if (data.messages && data.messages.length > 1) throw new Error('Circle bridge transaction has ambiguous messages.')
  const message = data.messages?.[0]
  const forwardState = typeof message?.forwardState === 'string'
    ? message.forwardState.toLowerCase()
    : ''
  const attestationState = typeof message?.status === 'string'
    ? message.status.toLowerCase()
    : 'pending'
  const result:CircleBridgeStatus = {
    // Pocket uses Circle's forwarding hook. Attestation completion alone does
    // not prove that USDC reached the destination wallet.
    status: forwardState || (attestationState === 'complete' ? 'attested' : attestationState),
    sourceConfirmed: attestationState === 'complete' || forwardState === 'confirmed' || forwardState === 'complete',
    destinationTxHash: typeof message?.forwardTxHash === 'string' ? message.forwardTxHash : undefined,
    message: typeof message?.message === 'string' ? message.message : undefined,
  }
  if(owner&&isCircleBridgeComplete(result.status)){
    const {bridgeCompletionClaim,verifyPocketBridgeRecord}=await import('./bridge-proof.js')
    const {readCircleLink,circleLinkKey}=await import('../privy-circle-link.js')
    const {parseUsdcAmount}=await import('./cctp.js')
    const claim=bridgeCompletionClaim(result.message)
    if(claim.destination!==owner.destination||parseUsdcAmount(claim.amount)!==parseUsdcAmount(owner.amount))throw Object.assign(Error('Bridge completion does not match the saved route.'),{status:409})
    const [from,to]=await Promise.all([readCircleLink(circleLinkKey(owner.ownerId,source,'payment')),readCircleLink(circleLinkKey(owner.ownerId,claim.destination,'payment'))])
    if(!from||!to)throw Object.assign(Error('Bridge wallet ownership is unavailable.'),{status:409})
    await verifyPocketBridgeRecord({source,destination:claim.destination,amount:owner.amount,txHash,sourceAddress:from.circleWalletAddress,destinationAddress:to.circleWalletAddress,destinationTxHash:result.destinationTxHash||''},fetcher)
  }
  return result
}

export function isCircleBridgeComplete(status: string) {
  return status === 'confirmed' || status === 'complete'
}
