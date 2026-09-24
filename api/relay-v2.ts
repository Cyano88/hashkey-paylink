import type { Request, Response } from 'express'

/** Legacy manual-deposit factory execution is retired. Historical receipts remain readable. */
export default function handler(_req: Request, res: Response) {
  return res.status(410).json({ ok: false, code: 'LEGACY_PAYMENT_RAIL_RETIRED', error: 'This payment method has been retired. Open the current Pocket checkout.' })
}
