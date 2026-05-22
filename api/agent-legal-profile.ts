import type { Request, Response } from 'express'
import { getAgentGovernanceProfile, getAgentLegalProfile } from './agent-legal.js'

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  const agent = String(req.query.agent ?? 'hashpaylink-agent').trim().toLowerCase()
  return res.json({
    ok: true,
    agent,
    legal: getAgentLegalProfile(agent),
    governance: getAgentGovernanceProfile(),
  })
}
