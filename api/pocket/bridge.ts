import type { Request, Response } from 'express'
import { circleLinkKey, readCircleLink } from '../privy-circle-link.js'
import { verifiedPrivyUser, type VerifiedLinkUser } from '../privy-circle-link.js'
import { CCTP_DOMAIN, formatUsdcUnits, parseUsdcAmount, readCctpForwardQuote, solanaRecipient, type PocketBridgeNetwork } from './cctp.js'
import { recordCirclePocketAction } from '../circle-pocket-action-journal.js'

type Dependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  readLink(key: string): ReturnType<typeof readCircleLink>
  quote: typeof readCctpForwardQuote
  readSolanaRecipient: typeof solanaRecipient
  record: typeof recordCirclePocketAction
  fetcher: typeof fetch
}

function network(value: unknown): PocketBridgeNetwork {
  if (value === 'base' || value === 'arbitrum' || value === 'solana') return value
  throw Object.assign(new Error('Choose Base, Arbitrum, or Solana.'), { status: 400 })
}

export function createPocketBridgeHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = { verifyUser: verifiedPrivyUser, readLink: readCircleLink, quote: readCctpForwardQuote, readSolanaRecipient: solanaRecipient, record: recordCirclePocketAction, fetcher: fetch, ...overrides }
  return async function pocketBridgeHandler(req: Request, res: Response) {
    if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Method not allowed.', retryable: false } })
    try {
      const identity = await dependencies.verifyUser(req)
      const action = String(req.method === 'GET' ? req.query.action ?? 'status' : req.body?.action ?? 'quote')
      if (action === 'status') {
        const source = network(req.query.source)
        const txHash = String(req.query.txHash ?? '').trim()
        if (!txHash || txHash.length > 128) throw Object.assign(new Error('A valid source transaction is required.'), { status: 400 })
        const response = await dependencies.fetcher(`https://iris-api.circle.com/v2/messages/${CCTP_DOMAIN[source]}?transactionHash=${encodeURIComponent(txHash)}`)
        const data = await response.json().catch(() => ({})) as { messages?: Array<Record<string, unknown>> }
        if (!response.ok && response.status !== 404) throw new Error('Circle bridge status is temporarily unavailable.')
        const message = data.messages?.[0]
        return res.json({
          ok: true,
          status: String(message?.forwardState ?? message?.status ?? 'pending').toLowerCase(),
          destinationTxHash: typeof message?.forwardTxHash === 'string' ? message.forwardTxHash : undefined,
        })
      }
      if (action === 'record') {
        const source = network(req.body?.source)
        const destination = network(req.body?.destination)
        const amount = String(req.body?.amount ?? '').trim()
        parseUsdcAmount(amount)
        const txHash = String(req.body?.txHash ?? '').trim()
        if (!txHash || txHash.length > 128) throw Object.assign(new Error('A valid source transaction is required.'), { status: 400 })
        const complete = req.body?.status === 'completed'
        const record = await dependencies.record({
          ownerId: identity.userId,
          idempotencyKey: `pocket:bridge:${source}:${txHash}`,
          action: 'wallet.bridge',
          status: complete ? 'completed' : 'submitted',
          resourceId: txHash,
          metadata: { source, destination, amount, paymentState: complete ? 'confirmed' : 'submitted', txHash },
        })
        return res.json({ ok: true, id: record.id })
      }
      if (action !== 'quote') throw Object.assign(new Error('Unsupported bridge action.'), { status: 400 })
      const source = network(req.body?.source)
      const destination = network(req.body?.destination)
      const transferUnits = parseUsdcAmount(String(req.body?.amount ?? ''))
      const [sourceLink, destinationLink] = await Promise.all([
        dependencies.readLink(circleLinkKey(identity.userId, source, 'payment')),
        dependencies.readLink(circleLinkKey(identity.userId, destination, 'payment')),
      ])
      if (!sourceLink) throw Object.assign(new Error(`Open your ${source} wallet before bridging.`), { status: 409 })
      if (!destinationLink) throw Object.assign(new Error(`Open your ${destination} wallet before bridging.`), { status: 409 })
      const solana = destination === 'solana' ? await dependencies.readSolanaRecipient(destinationLink.circleWalletAddress) : null
      const quote = await dependencies.quote(source, destination, transferUnits, solana?.needsSetup)
      return res.json({
        ok: true,
        quote: {
          source,
          destination,
          amount: formatUsdcUnits(quote.transferUnits),
          fee: formatUsdcUnits(quote.maxFeeUnits),
          total: formatUsdcUnits(quote.totalUnits),
          receive: formatUsdcUnits(quote.transferUnits),
          destinationAddress: destinationLink.circleWalletAddress,
          expiresAt: Date.now() + 30_000,
        },
      })
    } catch (reason) {
      const status = Number((reason as { status?: number }).status) || 503
      return res.status(status).json({ ok: false, error: { code: status === 401 ? 'AUTH_REQUIRED' : status < 500 ? 'VALIDATION_FAILED' : 'PROVIDER_UNAVAILABLE', message: reason instanceof Error ? reason.message : 'Bridge request failed.', retryable: status >= 500 } })
    }
  }
}

export default createPocketBridgeHandler()
