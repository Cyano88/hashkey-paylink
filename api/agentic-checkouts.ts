import type { Request, Response } from 'express'
import { createHash } from 'crypto'
import { formatUnits, isAddress, parseUnits } from 'viem'
import {
  beginHostedCheckoutAgenticAttempt,
  hostedCheckoutPaymentOption,
  markHostedCheckoutPaid,
  readVerifiedHostedCheckoutRecord,
  type CheckoutRecord,
  type HostedCheckoutNetwork,
} from './hosted-checkouts.js'

type AgenticPayment = {
  verified: boolean
  payer: string
  amount: string
  network: string
  transaction?: string
}

type AgenticRequest = Request & { payment?: AgenticPayment }
type GatewayMiddleware = (req: AgenticRequest, res: Response, next: (error?: unknown) => void) => void | Promise<void>
type Dependencies = {
  read: (id: string) => Promise<CheckoutRecord | null>
  markPaid: typeof markHostedCheckoutPaid
  beginAttempt: typeof beginHostedCheckoutAgenticAttempt
  protect: (record: CheckoutRecord) => Promise<GatewayMiddleware>
  reconcile: (record: CheckoutRecord) => Promise<CheckoutRecord | null>
  now: () => Date
}

const NETWORK_CONFIG: Record<HostedCheckoutNetwork, { caip: string; facilitatorUrl: string }> = {
  base: { caip: 'eip155:8453', facilitatorUrl: 'https://gateway-api.circle.com' },
  arbitrum: { caip: 'eip155:42161', facilitatorUrl: 'https://gateway-api.circle.com' },
  arc: { caip: 'eip155:5042002', facilitatorUrl: 'https://gateway-api-testnet.circle.com' },
}

function clean(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max)
}

function checkoutId(value: unknown) {
  const id = clean(value, 80)
  return /^chk_[a-zA-Z0-9]{8,40}$/.test(id) ? id : ''
}

function networkFromCaip(value: string): HostedCheckoutNetwork | '' {
  const match = Object.entries(NETWORK_CONFIG).find(([, config]) => config.caip === value)
  return (match?.[0] as HostedCheckoutNetwork | undefined) ?? ''
}

type GatewayTransfer = {
  id?: string
  status?: string
  token?: string
  sendingNetwork?: string
  fromAddress?: string
  toAddress?: string
  amount?: string
  nonce?: string
  createdAt?: string
}

function validGatewayTransferId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function paymentSignatureHeader(req: Request) {
  const raw = req.headers['payment-signature']
  return clean(Array.isArray(raw) ? raw[0] : raw, 24_000)
}

function parseAgenticAttempt(req: Request, record: CheckoutRecord) {
  const encoded = paymentSignatureHeader(req)
  if (!encoded) return null
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8')
    if (!decoded || decoded.length > 18_000) return null
    const payload = JSON.parse(decoded) as {
      accepted?: { network?: unknown }
      payload?: { authorization?: { from?: unknown; nonce?: unknown } }
    }
    const payer = clean(payload.payload?.authorization?.from, 80)
    const nonce = clean(payload.payload?.authorization?.nonce, 80).toLowerCase()
    const network = networkFromCaip(clean(payload.accepted?.network, 80)) || record.network
    if (!isAddress(payer) || !/^0x[a-f0-9]{64}$/.test(nonce) || !hostedCheckoutPaymentOption(record, network)) return null
    return {
      id: record.id,
      signatureHash: createHash('sha256').update(encoded).digest('hex'),
      nonce,
      payer,
      network,
      startedAt: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export async function reconcileGatewayPayment(record: CheckoutRecord, dependencies: {
  fetcher?: typeof fetch
  markPaid?: typeof markHostedCheckoutPaid
} = {}) {
  const fetcher = dependencies.fetcher ?? fetch
  const markPaid = dependencies.markPaid ?? markHostedCheckoutPaid
  if (record.payment?.status === 'paid') return record
  const attempts = [...(record.agenticAttempts ?? [])].reverse()
  for (const attempt of attempts) {
    const route = hostedCheckoutPaymentOption(record, attempt.network)
    if (!route) continue
    const config = NETWORK_CONFIG[attempt.network]
    const url = new URL('/v1/x402/transfers', config.facilitatorUrl)
    url.searchParams.set('nonce', attempt.nonce)
    url.searchParams.set('from', attempt.payer)
    url.searchParams.set('to', route.recipient)
    url.searchParams.set('network', config.caip)
    url.searchParams.set('pageSize', '5')
    const response = await fetcher(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8_000) })
    if (!response.ok) continue
    const body = await response.json().catch(() => undefined) as { transfers?: GatewayTransfer[] } | undefined
    const expectedAmount = parseUnits(record.amount, 6).toString()
    const transfer = body?.transfers?.find(item => {
      const createdAt = Date.parse(clean(item.createdAt, 40))
      return validGatewayTransferId(clean(item.id, 80))
        && clean(item.status, 20).toLowerCase() !== 'failed'
        && clean(item.token, 20).toUpperCase() === 'USDC'
        && clean(item.sendingNetwork, 80) === config.caip
        && clean(item.fromAddress, 80).toLowerCase() === attempt.payer.toLowerCase()
        && clean(item.toAddress, 80).toLowerCase() === route.recipient.toLowerCase()
        && clean(item.amount, 40) === expectedAmount
        && clean(item.nonce, 80).toLowerCase() === attempt.nonce
        && Number.isFinite(createdAt)
        && createdAt >= Date.parse(record.createdAt)
        && createdAt <= Date.parse(record.expiresAt) + 5 * 60_000
    })
    if (!transfer?.id) continue
    return markPaid({
      id: record.id,
      txHash: transfer.id,
      referenceType: 'circle_gateway_transfer',
      payer: attempt.payer,
      amount: record.amount,
      confirmedAt: clean(transfer.createdAt, 40),
      network: attempt.network,
    })
  }
  return null
}

async function createGatewayProtection(record: CheckoutRecord): Promise<GatewayMiddleware> {
  const route = hostedCheckoutPaymentOption(record, record.network)
  if (!route) throw new Error('Agentic checkout routing is unavailable.')
  const config = NETWORK_CONFIG[route.network]
  const { createGatewayMiddleware } = await import('@circle-fin/x402-batching/server')
  const gateway = createGatewayMiddleware({
    sellerAddress: route.recipient,
    networks: [config.caip],
    facilitatorUrl: config.facilitatorUrl,
    description: `${record.merchantName}: ${record.title}`,
  })
  return gateway.require(`$${record.amount}`) as GatewayMiddleware
}

const defaults: Dependencies = {
  read: id => readVerifiedHostedCheckoutRecord(id, { allowExpiredForReconciliation: true }),
  markPaid: markHostedCheckoutPaid,
  beginAttempt: beginHostedCheckoutAgenticAttempt,
  protect: createGatewayProtection,
  reconcile: reconcileGatewayPayment,
  now: () => new Date(),
}

export function createAgenticCheckoutsHandler(dependencies: Dependencies = defaults) {
  return async function agenticCheckoutsHandler(req: AgenticRequest, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    try {
      if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
      const id = checkoutId(req.query?.id)
      if (!id) return res.status(400).json({ ok: false, error: 'Invalid checkout id.' })
      const record = await dependencies.read(id)
      if (!record) return res.status(404).json({ ok: false, error: 'Checkout not found or expired.' })
      if (record.kind !== 'service' || record.flexible || record.settlement) {
        return res.status(409).json({ ok: false, error: 'This checkout is not eligible for agentic payment.' })
      }
      let current = record
      if (!current.payment && current.agenticAttempts?.length) {
        current = await dependencies.reconcile(current) ?? current
      }
      if (current.payment?.status === 'paid') {
        return res.json({
          ok: true,
          checkoutId: record.id,
          status: 'paid',
          paymentPath: 'agentic',
          network: current.payment.network ?? current.network,
          transaction: current.payment.txHash,
        })
      }

      if (dependencies.now().getTime() >= Date.parse(current.expiresAt)) return res.status(410).json({ ok: false, error: 'Checkout expired.' })

      const attempt = parseAgenticAttempt(req, current)
      if (attempt) await dependencies.beginAttempt({ ...attempt, startedAt: dependencies.now().toISOString() })

      const middleware = await dependencies.protect(current)
      let nextCalled = false
      let nextError: unknown
      await middleware(req, res, error => {
        nextCalled = true
        nextError = error
      })
      // A missing signature is answered by the middleware with the x402 402
      // challenge. Only continue after Circle Gateway verifies and settles it.
      if (!nextCalled) return
      if (nextError) throw nextError

      const payment = req.payment
      const network = networkFromCaip(clean(payment?.network, 80))
      const transaction = clean(payment?.transaction, 80)
      const payer = clean(payment?.payer, 80)
      if (!payment?.verified || !network || !validGatewayTransferId(transaction) || !isAddress(payer)) {
        return res.status(502).json({ ok: false, error: 'Circle Gateway returned incomplete payment proof.' })
      }
      if (!hostedCheckoutPaymentOption(current, network)) {
        return res.status(409).json({ ok: false, error: 'Agent payment network does not match this checkout.' })
      }
      const atomicAmount = clean(payment.amount, 40)
      if (!/^\d+$/.test(atomicAmount)) return res.status(502).json({ ok: false, error: 'Circle Gateway returned an invalid payment amount.' })

      const paid = await dependencies.markPaid({
        id: current.id,
        txHash: transaction,
        referenceType: 'circle_gateway_transfer',
        payer,
        amount: formatUnits(BigInt(atomicAmount), 6),
        confirmedAt: dependencies.now().toISOString(),
        network,
      })
      return res.json({
        ok: true,
        checkoutId: paid.id,
        status: paid.payment?.status ?? 'paid',
        paymentPath: 'agentic',
        network: paid.payment?.network ?? network,
        transaction: paid.payment?.txHash ?? transaction,
      })
    } catch (error) {
      console.error('[agentic-checkouts] request failed:', error instanceof Error ? error.message : String(error))
      return res.status(503).json({ ok: false, error: 'Agentic checkout is temporarily unavailable.' })
    }
  }
}

export default createAgenticCheckoutsHandler()
