import { consumePocketPaymentApproval } from './payment-security.js'
import { retirePosQr } from './pos-retirement.js'
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
    deletedAt: link.deletedAt,
    kind: 'usdc',
  }
}

export function createPocketPaylinksHandler(dependencies: Dependencies) {
  return async function pocketPaylinksHandler(req: Request, res: Response) {
    if (req.method !== 'GET' && req.method !== 'POST') return failure(res, 405, 'Method not allowed.')
    try {
      if (req.method === 'GET' && req.query?.action === 'status') {
        const id = String(req.query.eventId || '')
        if (!/^[a-zA-Z0-9:_-]{8,120}$/.test(id)) return failure(res,400,'Invalid collection.')
        res.setHeader('Cache-Control','no-store')
        return res.json({ok:true,active:await dependencies.repository.isActive(id)})
      }
      const identity = await dependencies.verifyUser(req)
      if (req.method === 'GET' && req.query?.action === 'collections') {
        const {listPocketBankCollections,listNgPosHistoryForOwner} = await import('../ng-pos.js')
        const [usdc,bank] = await Promise.all([dependencies.repository.listOwned(identity.userId),listPocketBankCollections(identity.userId)])
        const ids = new Set(bank.map(link=>link.eventId))
        const [payments,history] = await Promise.all([dependencies.listPayments(usdc.map(link=>link.eventId)), ids.size ? listNgPosHistoryForOwner(identity.userId,{repair:false}) : Promise.resolve({payments:[]})])
        return res.json({ok:true,links:[...usdc.map(publicLink),...bank],payments:[...payments.map(row=>({...row,source:'collection',direction:'in',paycrestStatus:'confirmed'})),...history.payments.filter(row=>ids.has(row.merchantId || '') || ids.has(String(row.eventId || '').replace(/^ngpos-/,'')))]})
      }
      if (req.method === 'POST' && req.body?.action === 'delete') {
        const id = String(req.body.eventId || '')
        const bank = req.body.kind === 'bank'
        const owned = bank ? (await (await import('../ng-pos.js')).listPocketBankCollections(identity.userId)).some(link=>link.eventId===id) : await dependencies.repository.getOwned(identity.userId,id)
        if (!owned) return failure(res,404,'Collection not found.')
        if (!await consumePocketPaymentApproval(String(req.headers['x-pocket-payment-approval'] || ''),identity.userId)) return failure(res,403,'Confirm with your PIN or fingerprint.')
        if (bank) await retirePosQr(identity.userId,id)
        else await dependencies.repository.retireOwned(identity.userId,id)
        return res.json({ok:true})
      }
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
      if (status === 400 || status === 401 || status === 403 || status === 404 || status === 409) {
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
