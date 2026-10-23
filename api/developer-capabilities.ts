import type { Request, Response } from 'express'
import { developerCapabilities } from '../src/lib/developerCapabilities.js'
// Public metadata only: no project, credential, wallet or runtime configuration lookup.
export default function developerCapabilitiesHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }) }
  return res.json({ ok: true, ...developerCapabilities() })
}
