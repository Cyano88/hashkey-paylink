import type { Request, Response } from 'express'
import { verifiedPrivyUser } from '../privy-circle-link.js'
import { usdAccountService } from './usd-account-service.js'
import { verifyBridgeSandboxSignature } from './bridge-sandbox-signature.js'
import { usdEnabled } from './usd-account-service.js'

export async function usdAccountWebhook(req: Request, res: Response) {
  if (!usdEnabled() || !process.env.BRIDGE_USD_WEBHOOK_PUBLIC_KEY) return res.status(503).end()
  if (!Buffer.isBuffer(req.body) || !verifyBridgeSandboxSignature(req.body, String(req.headers['x-webhook-signature'] || ''), process.env.BRIDGE_USD_WEBHOOK_PUBLIC_KEY.replace(/\\n/g, '\n'))) return res.status(400).end()
  try {
    const event = JSON.parse(req.body.toString('utf8'))
    if (event.api_version !== 'v0') return res.status(400).end()
    await usdAccountService.receiveEvent(event)
    return res.json({ received: true })
  } catch { return res.status(503).end() }
}

export default async function usdAccountHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false })
  let user
  try { user = await verifiedPrivyUser(req) } catch { return res.status(401).json({ ok: false, error: 'Sign in to continue.' }) }
  const action = req.method === 'GET' ? 'status' : req.body?.action
  if (!['status', 'onboard', 'create'].includes(action)) return res.status(400).json({ ok: false })
  try { return res.json({ ok: true, data: await usdAccountService.run(user, action, typeof req.body?.fullName === 'string' ? req.body.fullName : '') }) }
  catch { return res.status(503).json({ ok: false, error: 'Your account could not update. Please try again.' }) }
}
