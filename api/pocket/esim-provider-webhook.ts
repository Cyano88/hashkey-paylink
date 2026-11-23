import { createHash, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { sendPocketPush } from './push-devices.js'
import { createEsimOrderService } from './esim-orders.js'
import { createEsimCatalogProvider } from './esim-provider.js'
import { createEsimOrderProvider } from './esim-orders-provider.js'
import { verifyEvmUsdcTransfer } from '../usdc-transfer-verify.js'
import { esimPurchaseConfigured, esimTreasuryConfig, createEsimRefundAdapter } from './esim-checkout.js'
import { createCircleDeveloperTreasuryClient } from '../circle-developer-treasury.js'
import { circleLinkKey, readCircleLink } from '../privy-circle-link.js'

function first(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return ''
}

function eventFields(req: Request) {
  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
  const query = req.query as Record<string, unknown>
  const nested = (body.content && typeof body.content === 'object' ? body.content : query.content) as Record<string, unknown> | undefined
  const field = (name: string) => first(nested?.[name] ?? body[`content[${name}]`] ?? query[`content[${name}]`])
  return { type: first(body.notifyType ?? query.notifyType), transactionId: field('transactionId'), remain: field('remain') }
}

function tokenMatches(provided: string, expected: string) {
  const left = createHash('sha256').update(provided).digest()
  const right = createHash('sha256').update(expected).digest()
  return timingSafeEqual(left, right)
}

let service: ReturnType<typeof createEsimOrderService> | undefined
function orderService() {
  if (service) return service
  const config = esimTreasuryConfig(), circle = createCircleDeveloperTreasuryClient({ config })
  const catalog = createEsimCatalogProvider({ accessCode: process.env.ESIM_ACCESS_CODE?.trim() || '' })
  service = createEsimOrderService({
    catalog, supplier: createEsimOrderProvider({ accessCode: process.env.ESIM_ACCESS_CODE?.trim() || '' }),
    treasury: config.treasuryAddress, encryptionKey: process.env.POCKET_ESIM_ENCRYPTION_KEY || '',
    purchaseEnabled: () => esimPurchaseConfigured(), verifyTransfer: verifyEvmUsdcTransfer,
    readPayer: async ownerId => (await readCircleLink(circleLinkKey(ownerId, 'base')))?.circleWalletAddress || '',
    refund: createEsimRefundAdapter(config, circle), requireNetworkFee: true,
  })
  return service
}

export async function pocketEsimProviderWebhookHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  const expected = String(process.env.POCKET_ESIM_WEBHOOK_TOKEN || '')
  if (expected.length < 32 || !tokenMatches(String(req.params.token || ''), expected)) return res.status(404).json({ ok: false })
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ ok: false })
  const event = eventFields(req)
  if (!['DATA_USAGE', 'VALIDITY_USAGE'].includes(event.type) || !/^[a-zA-Z0-9:_-]{1,128}$/.test(event.transactionId)) return res.status(200).json({ ok: true })
  try {
    const owner = await orderService().providerNoticeOwner(event.transactionId)
    if (!owner) return res.status(200).json({ ok: true })
    const lowData = event.type === 'DATA_USAGE'
    const eventKey = `esim-access:${event.transactionId}:${event.type}:${event.remain || 'notice'}`
    await sendPocketPush(owner.ownerId, eventKey, {
      category: 'announcement',
      title: lowData ? 'Travel data running low' : 'Travel plan ends tomorrow',
      body: lowData ? 'Your plan has very little data left. Open Pocket to check your options.' : 'Your plan is due to expire soon. Open Pocket to check your options.',
      path: '/services/esim?order=' + encodeURIComponent(owner.profileId),
      tag: eventKey,
    })
    return res.status(200).json({ ok: true })
  } catch {
    return res.status(503).json({ ok: false })
  }
}
