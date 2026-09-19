import type { Request, Response } from 'express'
import { listRegisteredPaymentsForEventIds } from '../event-registry.js'
import { verifiedPrivyUser, type VerifiedLinkUser } from '../privy-circle-link.js'
import { pocketPaylinkRepository, type PocketPaylinkRepository } from './paylink-store.js'

type Dependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  repository: PocketPaylinkRepository
  listPayments(eventIds: string[]): ReturnType<typeof listRegisteredPaymentsForEventIds>
}

function failure(res: Response, status: number, message: string) {
  return res.status(status).json({ ok: false, error: { message } })
}

function publicLink(link: Awaited<ReturnType<PocketPaylinkRepository['listOwned']>>[number]) {
  return {
    eventId: link.eventId,
    title: link.title,
    paymentUrl: link.paymentUrl,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  }
}

export function createPocketPaylinksHandler(dependencies: Dependencies) {
  return async function pocketPaylinksHandler(req: Request, res: Response) {
    if (req.method !== 'GET' && req.method !== 'POST') return failure(res, 405, 'Method not allowed.')
    try {
      const identity = await dependencies.verifyUser(req)
      if (req.method === 'POST') {
        const saved = await dependencies.repository.save({
          ownerId: identity.userId,
          eventId: req.body?.eventId,
          title: req.body?.title,
          paymentUrl: req.body?.paymentUrl,
        })
        return res.status(saved.replayed ? 200 : 201).json({ ok: true, replayed: saved.replayed, link: publicLink(saved.link) })
      }

      const links = await dependencies.repository.listOwned(identity.userId)
      const payments = await dependencies.listPayments(links.map(link => link.eventId))
      return res.json({ ok: true, links: links.map(publicLink), payments })
    } catch (error) {
      const normalized = error as Error & { status?: number }
      const status = normalized.status ?? 500
      if (status === 400 || status === 401 || status === 403 || status === 409) {
        return failure(res, status, normalized.message)
      }
      return failure(res, 503, normalized.message || 'Pocket collections are temporarily unavailable.')
    }
  }
}

export default createPocketPaylinksHandler({
  verifyUser: verifiedPrivyUser,
  repository: pocketPaylinkRepository,
  listPayments: listRegisteredPaymentsForEventIds,
})
