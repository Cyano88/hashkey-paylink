/**
 * /api/relay-starknet — DEPRECATED
 *
 * Starknet Direct Send (ghost address pattern) has been removed.
 * Starknet payments now use the WalletConnect flow only (ArgentX / Braavos).
 */
import type { Request, Response } from 'express'

export default async function handler(_req: Request, res: Response) {
  return res.status(410).json({
    ok:    false,
    error: 'Starknet Direct Send has been deprecated. Use the WalletConnect flow.',
  })
}
