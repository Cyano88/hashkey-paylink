import type { Request, Response } from 'express'
import { verifiedPrivyUser } from '../privy-circle-link.js'
import { bridgeSandboxAllowed, bridgeSandboxService } from './bridge-sandbox-service.js'
import { readDurableJson } from '../render-durable-store.js'
import { verifyBridgeSandboxSignature } from './bridge-sandbox-signature.js'

export default async function bridgeSandboxHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  let user
  try { user = await verifiedPrivyUser(req) } catch { return res.status(401).json({ ok: false, error: 'Sign in to continue.' }) }
  if (!bridgeSandboxAllowed(user)) return res.status(404).json({ ok: false, error: 'Bank sandbox is unavailable for this account.' })
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false })
  const action = req.method === 'GET' ? 'status' : req.body?.action
  if (!['status', 'setup', 'deposit', 'payout'].includes(action)) return res.status(400).json({ ok: false, error: 'Invalid sandbox action.' })
  try { return res.json({ ok: true, snapshot: await bridgeSandboxService.run(user.userId, action) }) }
  catch { return res.status(503).json({ ok: false, error: 'The sandbox could not update yet. Continue to resume the same test.' }) }
}

export async function bridgeSandboxWebhook(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  if (process.env.POCKET_BRIDGE_SANDBOX_ENABLED !== 'true') return res.status(503).end()
  try {
    const config = await readDurableJson<{ publicKey: string }>('pocket:bridge-xyz:sandbox:webhook')
    if (!config?.publicKey) return res.status(503).end()
    if (!Buffer.isBuffer(req.body) || !verifyBridgeSandboxSignature(req.body, String(req.headers['x-webhook-signature'] || ''), config.publicKey)) return res.status(400).end()
    const event = JSON.parse(req.body.toString('utf8'))
    if (event.api_version !== 'v0') return res.status(400).end()
    await bridgeSandboxService.receiveEvent(event)
    return res.status(200).json({ received: true })
  } catch { return res.status(503).end() }
}
