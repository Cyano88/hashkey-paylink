import type { Request, Response } from 'express'
import { createNgPosBankSend, listNgPosHistoryForOwner } from '../ng-pos.js'
import { getPaycrestPosOrder, listPaycrestPosOrdersForMerchants, refreshPaycrestOrderStatus } from '../paycrest-pos.js'
import { circleLinkKey, readCircleLink, verifiedPrivyUser, type VerifiedLinkUser } from '../privy-circle-link.js'
import { isPocketIdempotencyKey } from '../../src/pocket/lib/pocketSchemas.js'

type Dependencies = {
  verifyUser: typeof verifiedPrivyUser
  readLink: typeof readCircleLink
  createBankSend: typeof createNgPosBankSend
  listHistory: typeof listNgPosHistoryForOwner
  getOrder: typeof getPaycrestPosOrder
  listOrders: typeof listPaycrestPosOrdersForMerchants
  refreshOrder: typeof refreshPaycrestOrderStatus
  createOrder(req: Request, body: Record<string, unknown>): Promise<{ status: number; body: any }>
}

const text = (value: unknown, max = 180) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

async function createOrderThroughNgPos(req: Request, body: Record<string, unknown>) {
  let status = 200
  let responseBody: any
  const response = { status(code: number) { status = code; return this }, json(value: unknown) { responseBody = value; return this } } as unknown as Response
  const ngPos = (await import('../ng-pos.js')).default
  await ngPos({ ...req, body } as Request, response)
  return { status, body: responseBody }
}

function stateFor(status: unknown) {
  const value = text(status, 40).toLowerCase()
  if (value === 'settled') return 'funded'
  if (value === 'expired' || value === 'cancelled') return 'expired'
  if (value === 'refunded') return 'refunded'
  if (value === 'initiated') return 'waiting'
  return 'processing'
}

function publicOrder(order: any) {
  return {
    intentId: text(order?.intent_id),
    orderId: text(order?.paycrest_order_id),
    status: text(order?.status),
    state: stateFor(order?.status),
    amountNgn: text(order?.provider_amount_to_transfer || order?.amount_ngn),
    amountUsdc: text(order?.amount_usdc),
    destinationNetwork: 'base' as const,
    destinationAddress: text(order?.destination_address),
    institution: text(order?.provider_institution),
    accountNumber: text(order?.provider_account_identifier),
    accountName: text(order?.provider_account_name),
    validUntil: text(order?.valid_until),
    txHash: text(order?.tx_hash),
  }
}

async function assertOwnedOrder(identity: VerifiedLinkUser, id: string, dependencies: Dependencies) {
  const order = await dependencies.getOrder(id)
  if (!order || order.source !== 'bank-send') throw Object.assign(new Error('Bank funding order was not found.'), { status: 404 })
  const history = await dependencies.listHistory(identity.userId)
  const owned = new Set(history.bankSendLinks.map(item => item.link_id))
  if (!owned.has(order.merchant_id)) throw Object.assign(new Error('Bank funding order does not belong to this Pocket account.'), { status: 403 })
  return order
}

export function createPocketBankFundHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = {
    verifyUser: verifiedPrivyUser,
    readLink: readCircleLink,
    createBankSend: createNgPosBankSend,
    listHistory: listNgPosHistoryForOwner,
    getOrder: getPaycrestPosOrder,
    listOrders: listPaycrestPosOrdersForMerchants,
    refreshOrder: refreshPaycrestOrderStatus,
    createOrder: createOrderThroughNgPos,
    ...overrides,
  }

  return async function pocketBankFundHandler(req: Request, res: Response) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    try {
      const identity = await dependencies.verifyUser(req)
      const action = text(req.body?.action, 30)
      if (action === 'prepare') {
        const idempotencyKey = text(req.headers['idempotency-key'], 128)
        if (!isPocketIdempotencyKey(idempotencyKey)) return res.status(400).json({ ok: false, error: 'A valid idempotency key is required.' })
        const amount = text(req.body?.amount_ngn, 30).replace(/,/g, '')
        const bankCode = text(req.body?.refund_bank_code, 90)
        const bankName = text(req.body?.refund_bank_name, 90)
        const accountNumber = text(req.body?.refund_account_number, 20).replace(/\D/g, '').slice(0, 10)
        const accountName = text(req.body?.refund_account_name, 90)
        if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return res.status(400).json({ ok: false, error: 'Enter a valid Naira funding amount.' })
        if (!bankCode || !bankName || accountNumber.length !== 10 || !accountName) return res.status(400).json({ ok: false, error: 'Verify your refund bank account first.' })
        const baseLink = await dependencies.readLink(circleLinkKey(identity.userId, 'base', 'payment'))
        if (!baseLink?.circleWalletAddress) return res.status(400).json({ ok: false, error: 'Open your Base Pocket wallet before funding it.' })

        const created = await dependencies.createBankSend(req, {
          owner_email: identity.email,
          owner_first_name: text(req.body?.owner_first_name, 90),
          owner_last_name: text(req.body?.owner_last_name, 90),
          display_name: 'Pocket Base USDC funding',
          amount,
          flexible_amount: false,
          network: 'base',
          destination_address: baseLink.circleWalletAddress,
          client_origin: text(req.body?.client_origin, 2_000),
        })
        const linkId = text((created as any)?.link?.link_id)
        if (!linkId) throw Object.assign(new Error('Could not prepare the Base funding link.'), { status: 502 })
        const existing = (await dependencies.listOrders([linkId]))[0]
        if (existing) return res.json({ ok: true, data: publicOrder(existing) })

        const prepared = await dependencies.createOrder(req, {
          action: 'createBankSendOrder',
          link_id: linkId,
          amount,
          refund_bank_name: bankName,
          refund_bank_code: bankCode,
          refund_account_number: accountNumber,
          refund_account_name: accountName,
          payer_email: identity.email,
          payer_name: `${text(req.body?.owner_first_name, 90)} ${text(req.body?.owner_last_name, 90)}`.trim(),
        })
        if (prepared.status !== 200 || !prepared.body?.order) throw Object.assign(new Error(prepared.body?.error || 'Could not prepare bank transfer instructions.'), { status: prepared.status })
        return res.json({ ok: true, data: publicOrder(prepared.body.order) })
      }

      if (action === 'status') {
        const id = text(req.body?.intent_id || req.body?.order_id)
        if (!id) return res.status(400).json({ ok: false, error: 'Missing bank funding order.' })
        await assertOwnedOrder(identity, id, dependencies)
        const refreshed = await dependencies.refreshOrder(id)
        if (!refreshed) return res.status(404).json({ ok: false, error: 'Bank funding order was not found.' })
        return res.json({ ok: true, data: publicOrder(refreshed) })
      }

      return res.status(400).json({ ok: false, error: 'Unknown bank funding action.' })
    } catch (reason) {
      const error = reason as Error & { status?: number }
      return res.status(error.status ?? 500).json({ ok: false, error: error.message || 'Bank funding failed.' })
    }
  }
}

export default createPocketBankFundHandler()
