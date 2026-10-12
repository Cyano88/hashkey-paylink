import type { Request, Response } from 'express'
import { verifiedPrivyUser } from '../privy-circle-link.js'
import { createEsimCatalogProvider } from './esim-provider.js'

export function createPocketEsimCatalogHandler({ verifyUser = verifiedPrivyUser, provider }: {
  verifyUser?: (req: Request) => Promise<unknown>
  provider: ReturnType<typeof createEsimCatalogProvider>
}) {
  return async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store')
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' })
    try { await verifyUser(req) } catch { return res.status(401).json({ error: 'Sign in to view eSIMs.' }) }
    if (!provider.configured) return res.json({ status: 'coming_soon', purchaseEnabled: false, destinations: [] })
    try {
      return res.json({ status: 'available', purchaseEnabled: false, destinations: await provider.catalog() })
    } catch {
      return res.status(503).json({ error: 'Could not update eSIM plans. Please try again.' })
    }
  }
}

let handler: ReturnType<typeof createPocketEsimCatalogHandler> | undefined
export function pocketEsimCatalogHandler(req: Request, res: Response) {
  handler ??= createPocketEsimCatalogHandler({ provider: createEsimCatalogProvider({
    accessCode: process.env.ESIM_ACCESS_CODE?.trim() || '',
  }) })
  return handler(req, res)
}
