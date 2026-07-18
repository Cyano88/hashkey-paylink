import type { Request, Response } from 'express'
import ngPosHandler, { createNgPosBankReceive, listNgPosHistoryForOwner } from '../ng-pos.js'
import { verifiedPrivyUser, type VerifiedLinkUser } from '../privy-circle-link.js'
import { isPocketIdempotencyKey } from '../../src/pocket/lib/pocketSchemas.js'

type LegacyResult = { status: number; body: any }
type BankWithdrawDependencies = {
  verifyUser: typeof verifiedPrivyUser
  createBankReceive: typeof createNgPosBankReceive
  listHistory: typeof listNgPosHistoryForOwner
  invokeLegacy: typeof invokeNgPos
}

async function invokeNgPos(req: Request, body: Record<string, unknown>): Promise<LegacyResult> {
  let status = 200
  let responseBody: unknown
  const response = {
    status(code: number) { status = code; return this },
    json(value: unknown) { responseBody = value; return this },
  } as unknown as Response
  await ngPosHandler({ ...req, body } as Request, response)
  if (responseBody === undefined) throw Object.assign(new Error('Bank payout provider returned no response.'), { status: 502 })
  return { status, body: responseBody }
}

function text(value: unknown, max = 180) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function payoutState(status: unknown) {
  const normalized = text(status, 40).toLowerCase()
  if (normalized === 'settled' || normalized === 'validated') return 'sent'
  if (normalized === 'refunded') return 'refunded'
  return 'processing'
}

export function publicOrder(order: any) {
  return {
    intentId: text(order?.intent_id),
    orderId: text(order?.paycrest_order_id),
    merchantId: text(order?.merchant_id),
    amountNgn: text(order?.amount_ngn),
    amountUsdc: text(order?.amount_usdc),
    receiveAddress: text(order?.receive_address),
    txHash: text(order?.tx_hash),
    providerStatus: text(order?.status),
    state: payoutState(order?.status),
    bankName: text(order?.bank_name),
    bankLast4: text(order?.bank_last4),
    accountName: text(order?.bank_account_name),
  }
}

async function assertOwnedOrder(req: Request, identity: VerifiedLinkUser, id: string, dependencies: BankWithdrawDependencies) {
  const current = await dependencies.invokeLegacy(req, { action: 'offrampStatus', intent_id: id, refresh: false })
  if (current.status !== 200 || !current.body?.order) throw Object.assign(new Error(current.body?.error || 'Bank payout was not found.'), { status: current.status })
  const history = await dependencies.listHistory(identity.userId)
  const merchantIds = new Set(history.merchants.map(item => item.merchant_id))
  if (!merchantIds.has(String(current.body.order.merchant_id))) throw Object.assign(new Error('Bank payout does not belong to this Pocket account.'), { status: 403 })
  return current.body.order
}

export function createPocketBankWithdrawHandler(overrides: Partial<BankWithdrawDependencies> = {}) {
  const dependencies: BankWithdrawDependencies = {
    verifyUser: verifiedPrivyUser,
    createBankReceive: createNgPosBankReceive,
    listHistory: listNgPosHistoryForOwner,
    invokeLegacy: invokeNgPos,
    ...overrides,
  }
  return async function pocketBankWithdrawHandler(req: Request, res: Response) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    try {
      const identity = await dependencies.verifyUser(req)
      const action = text(req.body?.action, 30)
      if (action === 'prepare') {
        const idempotencyKey = text(req.headers['idempotency-key'], 128)
        if (!isPocketIdempotencyKey(idempotencyKey)) return res.status(400).json({ ok: false, error: 'A valid idempotency key is required.' })
        const amount = text(req.body?.amount_ngn, 30)
        const walletAddress = text(req.body?.wallet_address, 80)
        const accountNumber = text(req.body?.account_number, 20).replace(/\D/g, '').slice(0, 10)
        if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return res.status(400).json({ ok: false, error: 'Enter a valid Naira payout amount.' })
        if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) return res.status(400).json({ ok: false, error: 'Open your Base Circle wallet before withdrawing.' })
        if (accountNumber.length !== 10 || !text(req.body?.account_name) || !text(req.body?.bank_code)) return res.status(400).json({ ok: false, error: 'Verify the destination bank account first.' })

        const forwardedRequest = {
          ...req,
          headers: req.headers,
          body: {
            ...req.body,
            amount,
            flexible_amount: false,
            direct_payout: true,
            display_name: text(req.body?.memo) || 'Direct bank payout',
            client_origin: text(req.body?.client_origin),
          },
        } as Request
        const created = await dependencies.createBankReceive(forwardedRequest)
        const link = (created as any)?.link
        if (!link?.intent_id || !link?.merchant_id) throw Object.assign(new Error('Could not prepare the bank payout intent.'), { status: 502 })
        const prepared = await dependencies.invokeLegacy(req, {
          action: 'createOfframpOrder',
          intent_id: link.intent_id,
          refund_address: walletAddress,
          payer_wallet: walletAddress,
          payer_email: identity.email || text(req.body?.owner_email),
          payer_name: `${text(req.body?.owner_first_name)} ${text(req.body?.owner_last_name)}`.trim(),
        })
        if (prepared.status !== 200 || !prepared.body?.order) throw Object.assign(new Error(prepared.body?.error || 'Could not prepare bank payout.'), { status: prepared.status })
        return res.json({ ok: true, data: publicOrder(prepared.body.order) })
      }

      const id = text(req.body?.intent_id || req.body?.order_id)
      if (!id) return res.status(400).json({ ok: false, error: 'Missing bank payout id.' })
      await assertOwnedOrder(req, identity, id, dependencies)

      if (action === 'confirm') {
        const confirmed = await dependencies.invokeLegacy(req, {
          action: 'markOfframpPaid',
          intent_id: id,
          order_id: text(req.body?.order_id),
          tx_hash: text(req.body?.tx_hash),
          payer_wallet: text(req.body?.wallet_address),
          payer_email: identity.email,
        })
        if (confirmed.status !== 200 || !confirmed.body?.order) throw Object.assign(new Error(confirmed.body?.error || 'Could not verify bank payout transfer.'), { status: confirmed.status })
        return res.json({ ok: true, data: publicOrder(confirmed.body.order) })
      }

      if (action === 'status') {
        const status = await dependencies.invokeLegacy(req, { action: 'offrampStatus', intent_id: id, refresh: true })
        if (status.status !== 200 || !status.body?.order) throw Object.assign(new Error(status.body?.error || 'Could not refresh bank payout.'), { status: status.status })
        return res.json({ ok: true, data: publicOrder(status.body.order) })
      }

      return res.status(400).json({ ok: false, error: 'Unknown bank payout action.' })
    } catch (reason) {
      const error = reason as Error & { status?: number }
      return res.status(error.status ?? 500).json({ ok: false, error: error.message || 'Bank payout failed.' })
    }
  }
}

const pocketBankWithdrawHandler = createPocketBankWithdrawHandler()
export default pocketBankWithdrawHandler
