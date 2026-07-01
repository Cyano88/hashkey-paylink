import type { Request, Response } from 'express'

export default async function handler(_req: Request, res: Response) {
  return res.status(410).json({
    ok: false,
    error: 'Starknet balances are no longer supported. Use Base, Arc, Arbitrum, or Solana.',
  })
}
