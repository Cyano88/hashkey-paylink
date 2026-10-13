import type { Request, Response } from 'express'
import { verifiedPrivyUser } from '../privy-circle-link.js'
import { createEsimCatalogProvider } from './esim-provider.js'
import { esimPurchaseConfigured } from './esim-checkout.js'

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
      return res.json({ status: 'available', purchaseEnabled: esimPurchaseConfigured(), destinations: await provider.catalog() })
    } catch {
      return res.status(503).json({ error: 'Could not update eSIM plans. Please try again.' })
    }
  }
}

let handler: ReturnType<typeof createPocketEsimCatalogHandler> | undefined
let defaultProvider: ReturnType<typeof createEsimCatalogProvider> | undefined
function provider() { return defaultProvider ??= createEsimCatalogProvider({ accessCode: process.env.ESIM_ACCESS_CODE?.trim() || '' }) }
export function pocketEsimCatalogHandler(req: Request, res: Response) {
  handler ??= createPocketEsimCatalogHandler({ provider: provider() })
  return handler(req, res)
}

export function createPocketEsimPriceHandler({ verifyUser = verifiedPrivyUser, provider }: {
  verifyUser?: (req: Request) => Promise<unknown>; provider: ReturnType<typeof createEsimCatalogProvider>
}) {
  return async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store')
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })
    try { await verifyUser(req) } catch { return res.status(401).json({ error: 'Sign in to view eSIM prices.' }) }
    const packageCode = req.body?.packageCode, days = req.body?.days
    if (typeof packageCode !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(packageCode) || !Number.isInteger(days) || days < 1 || days > 365) return res.status(400).json({ error: 'Choose a valid plan and duration.' })
    try {
      const price = await provider.price(packageCode, days)
      return res.json({ price: price.public, purchaseEnabled: esimPurchaseConfigured() })
    } catch {
      return res.status(503).json({ error: 'This plan is temporarily unavailable.' })
    }
  }
}
export function pocketEsimPriceHandler(req: Request, res: Response) {
  return createPocketEsimPriceHandler({ provider: provider() })(req, res)
}
