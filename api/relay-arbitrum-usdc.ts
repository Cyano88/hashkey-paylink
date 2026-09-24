import type { Request, Response } from 'express'
export default function handler(_req: Request, res: Response) {
 return res.status(410).json({ ok: false, code: 'ARBITRUM_RELAY_RETIRED', error: 'Use the Circle-sponsored Pocket payment flow.' })
}
