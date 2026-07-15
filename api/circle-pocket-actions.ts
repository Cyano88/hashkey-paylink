import type { Request, Response } from 'express'
import {
  circlePocketIdentityErrorStatus,
  circlePocketIdentityId,
  resolveCirclePocketIdentity,
} from './circle-pocket-identity.js'
import { listCirclePocketActions } from './circle-pocket-action-journal.js'

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  try {
    const identity = await resolveCirclePocketIdentity(req)
    const actions = (await listCirclePocketActions(circlePocketIdentityId(identity), Number(req.query.limit) || 50))
      .map(({ ownerId: _ownerId, idempotencyKey: _idempotencyKey, ...action }) => action)
    return res.json({ ok: true, actions })
  } catch (error) {
    return res.status(circlePocketIdentityErrorStatus(error)).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unauthorized Circle Pocket session.',
    })
  }
}
