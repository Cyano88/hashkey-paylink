import type { Request, Response } from 'express'
import { circleLinkKey, readCircleLink } from '../privy-circle-link.js'
import { verifiedPrivyUser, type VerifiedLinkUser } from '../privy-circle-link.js'
import { formatUsdcUnits, parseUsdcAmount, readCctpForwardQuote, solanaRecipient, type PocketBridgeNetwork } from './cctp.js'
import { isCircleBridgeComplete, readCircleBridgeStatus } from './circle-bridge-status.js'
import { appendPocketMoneyLedgerEvent } from './money-ledger.js'
import { recordCirclePocketAction } from '../circle-pocket-action-journal.js'

type Dependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  readLink(key: string): ReturnType<typeof readCircleLink>
  quote: typeof readCctpForwardQuote
  readSolanaRecipient: typeof solanaRecipient
  record: typeof recordCirclePocketAction
  fetcher: typeof fetch
  appendLedger: typeof appendPocketMoneyLedgerEvent
}

function network(value: unknown): PocketBridgeNetwork {
  if (value === 'base' || value === 'arbitrum' || value === 'solana') return value
  throw Object.assign(new Error('Choose Base, Arbitrum, or Solana.'), { status: 400 })
}

export function createPocketBridgeHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = { verifyUser: verifiedPrivyUser, readLink: readCircleLink, quote: readCctpForwardQuote, readSolanaRecipient: solanaRecipient, record: recordCirclePocketAction, fetcher: fetch, appendLedger: appendPocketMoneyLedgerEvent, ...overrides }
  return async function pocketBridgeHandler(req: Request, res: Response) {
    if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Method not allowed.', retryable: false } })
    try {
      const identity = await dependencies.verifyUser(req)
      const action = String(req.method === 'GET' ? req.query.action ?? 'status' : req.body?.action ?? 'quote')
      if (action === 'status') {
        const source = network(req.query.source)
        const txHash = String(req.query.txHash ?? '').trim()
        if (!txHash || txHash.length > 128) throw Object.assign(new Error('A valid source transaction is required.'), { status: 400 })
        const bridge = await readCircleBridgeStatus(source, txHash, dependencies.fetcher)
        return res.json({
          ok: true,
          status: bridge.status,
          destinationTxHash: bridge.destinationTxHash,
        })
      }
      if (action === 'record') {
        const source = network(req.body?.source)
        const destination = network(req.body?.destination)
        const amount = String(req.body?.amount ?? '').trim()
        parseUsdcAmount(amount)
        const txHash = String(req.body?.txHash ?? '').trim()
        if (!txHash || txHash.length > 128) throw Object.assign(new Error('A valid source transaction is required.'), { status: 400 })
        const requestedComplete = req.body?.status === 'completed'
        let complete = false
        if (requestedComplete) {
          const provider = await readCircleBridgeStatus(source, txHash, dependencies.fetcher)
          complete = isCircleBridgeComplete(provider.status)
          if (!complete) throw Object.assign(new Error('Circle has not confirmed this bridge yet.'), { status: 409 })
        }
        const record = await dependencies.record({
          ownerId: identity.userId,
          idempotencyKey: `pocket:bridge:${source}:${txHash}`,
          action: 'wallet.bridge',
          status: complete ? 'completed' : 'submitted',
          resourceId: txHash,
          metadata: { source, destination, amount, paymentState: complete ? 'confirmed' : 'submitted', txHash },
        })
        await dependencies.appendLedger({
          eventKey: `wallet-bridge:${record.id}:${record.status}:${record.updatedAt}`,
          ownerId: identity.userId,
          executionId: record.id,
          rail: 'wallet_bridge',
          state: record.status,
          asset: 'USDC',
          amount,
          sourceNetwork: source,
          settlementNetwork: destination,
          resourceId: record.id,
          transactionHash: txHash,
          metadata: { source, destination, paymentState: complete ? 'confirmed' : 'submitted' },
          recordedAt: record.updatedAt,
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
