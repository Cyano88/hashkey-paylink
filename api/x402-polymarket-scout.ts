import type { Request, Response } from 'express'
export default function handler(_req: Request, res: Response) {
  return res.status(410).json({ ok: false, code: 'SCOUT_RETIRED', error: 'Polymarket Scout is no longer offered by Hash PayLink.' })
}
