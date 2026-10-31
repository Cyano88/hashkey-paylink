import type { Request, Response, NextFunction } from 'express'

// Deliberately not controlled by an environment flag. Archived features cannot
// be re-enabled by stale production configuration or an old mobile client.
const retired = new Set([
  'relay-stream', 'relay-checkpoint', 'settle-poa', 'store-content',
  'list-creator-content', 'creator-earnings', 'hashpaystream-agent-context',
  'creator-discover-content', 'admin/creator-content', 'get-content',
  'get-content-stream', 'get-content-checkpoint', 'creator-checkpoint-vault',
  'get-content-x402', 'creator-unlock-x402', 'creator-social',
  'creator-content-view', 'register-vault', 'get-vault', 'list-viewers',
  'event-register', 'list-event-payments', 'stream-recipient-invite',
  'stream-history', 'arena-room', 'creator-book', 'arc-agreement-operations',
])
export function retiredProductPath(path: string) {
  const clean = path.toLowerCase().replace(/\/+$/, '')
  return clean === '/api/v2/agreements' || clean.startsWith('/api/v2/agreements/')
    || clean === '/api/hashpaystream' || clean.startsWith('/api/hashpaystream/')
    || clean.startsWith('/api/creator-social/')
    || (clean.startsWith('/api/') && retired.has(clean.slice(5)))
}
export function retiredProductBoundary(req: Request, res: Response, next: NextFunction) {
  if (!retiredProductPath(req.path)) return next()
  res.setHeader('Cache-Control', 'no-store')
  return res.status(410).json({ok:false,code:'PRODUCT_UNAVAILABLE',error:'This service is unavailable. Escrow service is under development.'})
}
