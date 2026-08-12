import type { Request, Response } from 'express'
import { listRegisteredPaymentsForEventIds } from '../event-registry.js'
import { localCurrencyProfileRepository, verifiedPrivyUser, type ProfileRepository } from '../local-currency-profile.js'
import { pocketRequestRepository, type PocketRequestRepository } from './request-store.js'

type Dependencies = { verifyUser(req: Request): ReturnType<typeof verifiedPrivyUser>; profiles: ProfileRepository; repository: PocketRequestRepository; listPayments(eventIds: string[]): ReturnType<typeof listRegisteredPaymentsForEventIds> }
const fail = (res: Response, status: number, message: string) => res.status(status).json({ ok: false, error: { message } })
const publicRequest = (item: Awaited<ReturnType<PocketRequestRepository['listFor']>>[number], userId: string, paid: boolean) => ({ id: item.id, eventId: item.eventId, direction: item.recipientId === userId ? 'incoming' : 'outgoing', senderPocketId: item.senderPocketId, senderName: item.senderName, recipientPocketId: item.recipientPocketId, title: item.title, amount: item.amount, flexibleAmount: item.flexibleAmount, network: item.network, paymentUrl: item.paymentUrl, status: paid ? 'paid' : item.status, createdAt: item.createdAt, updatedAt: item.updatedAt })

export function createPocketRequestsHandler(deps: Dependencies) {
  return async function handler(req: Request, res: Response) {
    if (req.method !== 'GET' && req.method !== 'POST') return fail(res, 405, 'Method not allowed.')
    try {
      const identity = await deps.verifyUser(req)
      const sender = await deps.profiles.ensure(identity)
      if (req.method === 'POST' && req.body?.action === 'create') {
        const recipient = await deps.profiles.getByPocketId(String(req.body?.recipientPocketId ?? ''))
        if (!recipient) return fail(res, 404, 'Pocket user was not found.')
        const network = ['base', 'arbitrum', 'solana', 'multi'].includes(req.body?.network) ? req.body.network as 'base' | 'arbitrum' | 'solana' | 'multi' : 'base'
        const saved = await deps.repository.create({ eventId: req.body?.eventId, senderId: identity.userId, senderPocketId: sender.profile.pocketId, senderName: sender.profile.resolvedName || 'Pocket ' + sender.profile.pocketId, recipientId: recipient.privyUserId, recipientPocketId: recipient.pocketId, title: String(req.body?.title ?? '').trim().slice(0, 100) || 'Payment request', amount: String(req.body?.amount ?? '').trim(), flexibleAmount: req.body?.flexibleAmount === true, network, paymentUrl: req.body?.paymentUrl })
        return res.status(saved.replayed ? 200 : 201).json({ ok: true, request: publicRequest(saved.request, identity.userId, false) })
      }
      if (req.method === 'POST' && (req.body?.action === 'accept' || req.body?.action === 'decline')) {
        const decided = await deps.repository.decide(identity.userId, req.body?.id, req.body.action)
        return res.json({ ok: true, request: publicRequest(decided, identity.userId, false) })
      }
      if (req.method === 'POST') return fail(res, 400, 'Choose a valid request action.')
      const requests = await deps.repository.listFor(identity.userId)
      const payments = await deps.listPayments(requests.map(item => item.eventId))
      const paidIds = new Set(payments.map(item => item.eventId))
      return res.json({ ok: true, requests: requests.map(item => publicRequest(item, identity.userId, paidIds.has(item.eventId))) })
    } catch (reason) {
      const error = reason as Error & { status?: number }
      return fail(res, error.status && error.status < 500 ? error.status : 503, error.message || 'Pocket requests are temporarily unavailable.')
    }
  }
}
export default createPocketRequestsHandler({ verifyUser: verifiedPrivyUser, profiles: localCurrencyProfileRepository, repository: pocketRequestRepository, listPayments: listRegisteredPaymentsForEventIds })
