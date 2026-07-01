import type { Request, Response } from 'express'

export default async function handler(_req: Request, res: Response) {
  return res.status(410).json({
    ok: false,
    error: 'Starknet recovery is no longer supported. Use supported Circle payment networks.',
  })
}
