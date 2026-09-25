import type { Request, Response } from 'express'
import { resolveDeveloperApiKeyPolicy } from './developer-projects.js'

// Never return the policy wholesale: it includes identity and bank details.
export function createDeveloperCliProjectHandler(resolve = resolveDeveloperApiKeyPolicy) {
  return async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    }
    try {
      const policy = await resolve(req)
      if (!policy) return res.status(401).json({ ok: false, error: 'An active project key and ready settlement configuration are required.' })
      return res.json({ ok: true, project: {
        id: policy.partnerId, name: policy.merchantName,
        environment: policy.environment, checkoutMode: policy.checkoutMode,
        defaultNetwork: policy.paymentOptions.length ? policy.defaultNetwork : null,
        capabilities: policy.capabilities,
        networks: policy.paymentOptions.map(option => option.network),
        settlementMode: policy.settlementMode, webhookConfigured: policy.webhookConfigured,
      } })
    } catch {
      return res.status(503).json({ ok: false, error: 'Project configuration is temporarily unavailable.' })
    }
  }
}
export default createDeveloperCliProjectHandler()
