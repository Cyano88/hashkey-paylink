import type { Request, Response } from 'express'
import crypto from 'node:crypto'
import { appendAgentActivity } from './agent-activity.js'
import { getAgentGovernanceProfile } from './agent-legal.js'

const GOVERNANCE_SECRET = String(process.env.AGENT_GOVERNANCE_SECRET ?? process.env.AGENT_WALLET_SERVICE_SECRET ?? '').trim()

function clean(value: unknown, fallback = '') {
  return String(value ?? fallback).trim()
}

function hashEvent(input: Record<string, unknown>) {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  const secret = String(req.headers['x-agent-governance-secret'] ?? req.body?.secret ?? '').trim()
  const authorized = GOVERNANCE_SECRET
    && secret.length === GOVERNANCE_SECRET.length
    && crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(GOVERNANCE_SECRET))
  if (!authorized) return res.status(401).json({ ok: false, error: 'Unauthorized' })

  const agentSlug = clean(req.body?.agentSlug, 'hashpaylink-agent').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 32)
  const title = clean(req.body?.title, 'Agent governance updated')
  const detail = clean(req.body?.detail, 'Model, prompt, config, or operating procedure changed.')
  const governance = {
    ...getAgentGovernanceProfile(),
    event: {
      title,
      detail,
      modelId: clean(req.body?.modelId) || undefined,
      promptHash: clean(req.body?.promptHash) || undefined,
      configHash: clean(req.body?.configHash) || undefined,
      operatingAgreementHash: clean(req.body?.operatingAgreementHash) || undefined,
      recordedAt: new Date().toISOString(),
    },
  }
  const eventHash = hashEvent(governance)
  const activity = await appendAgentActivity({
    agentSlug,
    type: 'governance',
    title,
    direction: 'system',
    network: 'Agent governance',
    detail,
    txHash: eventHash,
  })
  return res.json({ ok: true, agentSlug, eventHash, governance, activity })
}
