import type { Request } from 'express'

/** Preserve IncomingMessage header getters and Express methods when replacing a body. */
export function forwardPocketRequest(req: Request, body: Record<string, unknown>): Request {
  return Object.assign(Object.create(req), { body, method: 'POST' }) as Request
}
