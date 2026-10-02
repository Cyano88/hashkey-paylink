import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/server-auth'
import { readDurableJson } from './render-durable-store.js'
import { authorizeOperations, isOperationsFounder, operationsPolicy, workspaceSections, type OperationsIdentity, type OperationsSection } from './operations-policy.js'

export async function verifyOperationsIdentity(req: Request): Promise<OperationsIdentity> {
  const appId = (process.env.PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID || '').trim()
  const secret = (process.env.PRIVY_APP_SECRET || '').trim()
  if (!appId || !secret) throw Object.assign(Error('Operations authentication is not configured.'), { status: 503 })
  const token = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!token) throw Object.assign(Error('Sign in to operations.'), { status: 401 })
  try {
    const client = new PrivyClient(appId, secret), claims = await client.verifyAuthToken(token)
    const user = await client.getUserById(claims.userId)
    const account = user.linkedAccounts.find(a => a.type === 'email')
    return { userId: claims.userId, email: account?.type === 'email' ? account.address.trim().toLowerCase() : '' }
  } catch { throw Object.assign(Error('Your operations session is invalid or expired.'), { status: 401 }) }
}

export async function verifyOperationsSection(req: Request, section: OperationsSection) {
  const identity = await verifyOperationsIdentity(req)
  authorizeOperations(identity, req, section)
  return identity
}

type Project = { id: string; name: string; capabilities?: string[]; operationalStatus?: string }
export function operationsSession(identity: OperationsIdentity, projects: Project[], env = process.env) {
  const policy = operationsPolicy(env)
  const assigned = new Set(policy.workspaces.flatMap(w => w.projectIds))
  const definitions = [{ id: 'pocket', name: 'Pocket', projectIds: [] as string[] }, ...policy.workspaces,
    ...projects.filter(p => !assigned.has(p.id)).map(p => ({ id: p.id, name: p.name, projectIds: [p.id] }))]
  const workspaces = definitions.flatMap(w => {
    const integrations = projects.filter(p => w.projectIds.includes(p.id)).map(p => ({ id: p.id, name: p.name,
      capabilities: p.capabilities || [], status: p.operationalStatus || 'active' }))
    const sections = workspaceSections(identity, w.id, policy).filter(section => section === 'agreements'
      ? integrations.some(p => p.capabilities.includes('arc_agreements'))
      : section === 'trade-disputes' ? integrations.some(p => p.capabilities.includes('xstocks_agreements')) : true)
    if (!sections.length) return []
    // Missing mappings must be visible to the founder rather than silently reassigned.
    return [{ ...w, sections, integrations, missingProjectIds: w.projectIds.filter(id => !projects.some(p => p.id === id)) }]
  })
  if (!workspaces.length) throw Object.assign(Error('This account has no operations access.'), { status: 403 })
  return { ok: true, founder: isOperationsFounder(identity, policy), email: identity.email, workspaces,
    arcActivationEnabled: env.ARC_AGREEMENTS_ENABLED === 'true' }
}

export default async function operationsSessionHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  try {
    const identity = await verifyOperationsIdentity(req)
    const policy = operationsPolicy()
    if (!isOperationsFounder(identity, policy) && !policy.grants.some(g => g.email.toLowerCase() === identity.email.toLowerCase())) {
      throw Object.assign(Error('This account has no operations access.'), { status: 403 })
    }
    const store = await readDurableJson<{ projects: Record<string, Project> }>((process.env.DEVELOPER_PROJECT_STORE_KEY || 'hashpaylink:developer-projects:v1').trim())
    return res.json(operationsSession(identity, Object.values(store?.projects || {})))
  } catch (e) {
    const error = e as Error & { status?: number }
    return res.status(error.status || 503).json({ ok: false, error: error.status ? error.message : 'Operations could not be loaded.' })
  }
}
