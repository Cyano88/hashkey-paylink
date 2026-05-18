import type { NextFunction, Request, Response } from 'express'
import { formatUnits } from 'viem'

type PaidRequest = Request & {
  payment?: {
    verified: boolean
    payer: string
    amount: string
    network: string
    transaction?: string
  }
}

const SELLER_ADDRESS = process.env.X402_SELLER_ADDRESS ?? process.env.TREASURY_ADDRESS
const PRICE = process.env.X402_POLYMARKET_SCOUT_PRICE ?? '$0.01'
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? 'https://gateway-api-testnet.circle.com'

let gatewayMiddleware: ((req: Request, res: Response, next: NextFunction) => void) | undefined

async function getGatewayMiddleware() {
  if (!SELLER_ADDRESS) throw new Error('X402_SELLER_ADDRESS or TREASURY_ADDRESS is required')
  if (!gatewayMiddleware) {
    const { createGatewayMiddleware } = await import('@circle-fin/x402-batching/server')
    const gateway = createGatewayMiddleware({
      sellerAddress: SELLER_ADDRESS,
      facilitatorUrl: FACILITATOR_URL,
      description: 'Hash PayLink Polymarket LP Scout x402 API',
    })
    gatewayMiddleware = gateway.require(PRICE)
  }
  return gatewayMiddleware
}

function scoutResponse(req: PaidRequest) {
  const payment = req.payment
  const amount = payment?.amount ? `${formatUnits(BigInt(payment.amount), 6)} USDC` : PRICE
  return {
    ok: true,
    service: 'Hash PayLink x402 Polymarket LP Scout',
    paid: true,
    payment: payment
      ? {
          payer: payment.payer,
          amount,
          network: payment.network,
          transaction: payment.transaction,
        }
      : undefined,
    scout: {
      summary: 'Agent-paid x402 scout response. Use this as the machine-to-machine version of LP Scout.',
      signals: [
        'Prioritize active, unresolved Polymarket markets with live liquidity incentives.',
        'Avoid markets that are already ended, resolved, fully settled, or too close to expiry.',
        'For LP work, compare reward size, max spread, min size, live order book depth, and event resolution risk before quoting.',
      ],
      nextAction: 'Have the agent combine this paid API result with live market/order-book checks before making a user-facing recommendation.',
      disclaimer: 'Educational product signal only. Not financial advice.',
    },
    receipt: {
      provider: 'Circle Gateway x402',
      price: PRICE,
      seller: SELLER_ADDRESS,
      generatedAt: new Date().toISOString(),
    },
  }
}

export default async function handler(req: Request, res: Response, next?: NextFunction) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  try {
    const middleware = await getGatewayMiddleware()
    return middleware(req, res, () => res.json(scoutResponse(req as PaidRequest)))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'x402 scout unavailable'
    if (next) return next(err)
    return res.status(500).json({ ok: false, error: message })
  }
}
