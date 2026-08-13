import type { Request, Response } from 'express'
import { listRegisteredPaymentsForEventIds } from '../event-registry.js'
import { localCurrencyProfileRepository, verifiedPrivyUser, type ProfileRepository } from '../local-currency-profile.js'
import { circleLinkKey, readCircleLink, type CircleLinkRecord } from '../privy-circle-link.js'
import { pocketRequestRepository, type PocketRequestRepository } from './request-store.js'

type Dependencies = { verifyUser(req: Request): ReturnType<typeof verifiedPrivyUser>; profiles: ProfileRepository; repository: PocketRequestRepository; listPayments(eventIds: string[]): ReturnType<typeof listRegisteredPaymentsForEventIds>; readWallet?: (key: string) => Promise<CircleLinkRecord | null> }
const fail = (res: Response, status: number, message: string) => res.status(status).json({ ok: false, error: { message } })
const publicRequest = (item: Awaited<ReturnType<PocketRequestRepository['listFor']>>[number], userId: string, paid: boolean) => ({ id: item.id, eventId: item.eventId, direction: item.recipientId === userId ? 'incoming' : 'outgoing', senderPocketId: item.senderPocketId, senderName: item.senderName, recipientPocketId: item.recipientPocketId, title: item.title, amount: item.amount, flexibleAmount: item.flexibleAmount, network: item.network, paymentUrl: item.paymentUrl, status: paid ? 'paid' : item.status, createdAt: item.createdAt, updatedAt: item.updatedAt })

export function createPocketRequestsHandler(deps: Dependencies) {
  return async function handler(req: Request, res: Response) {
    if (req.method !== 'GET' && req.method !== 'POST') return fail(res, 405, 'Method not allowed.')
    try {
      const identity = await deps.verifyUser(req)
      const sender = await deps.profiles.ensure(identity)
      if (req.method === 'POST' && req.body?.action === 'resolve-recipient') {
        const pocketId = String(req.body?.pocketId ?? '').trim()
        const network = ['base', 'arbitrum', 'solana'].includes(req.body?.network) ? req.body.network as 'base' | 'arbitrum' | 'solana' : null
        if (!/^\d{6,12}$/.test(pocketId) || !network) return fail(res, 400, 'Enter a valid Pocket ID and network.')
        if (pocketId === sender.profile.pocketId) return fail(res, 400, 'You cannot send to your own Pocket ID.')
        const recipient = await deps.profiles.getByPocketId(pocketId)
        if (!recipient) return fail(res, 404, 'Pocket user was not found.')
        if (!deps.readWallet) return fail(res, 503, 'Pocket recipient lookup is unavailable.')
        const wallet = await deps.readWallet(circleLinkKey(recipient.privyUserId, network))
        if (!wallet?.circleWalletAddress) return fail(res, 409, `This Pocket user has not opened a ${network === 'solana' ? 'Solana' : network === 'arbitrum' ? 'Arbitrum' : 'Base'} wallet yet.`)
        return res.json({ ok: true, recipient: { pocketId: recipient.pocketId, name: recipient.resolvedName || `Pocket ${recipient.pocketId}`, network, address: wallet.circleWalletAddress } })
      }
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
export default createPocketRequestsHandler({ verifyUser: verifiedPrivyUser, profiles: localCurrencyProfileRepository, repository: pocketRequestRepository, listPayments: listRegisteredPaymentsForEventIds, readWallet: readCircleLink })
