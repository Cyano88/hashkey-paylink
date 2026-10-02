import type { Request } from 'express'

export const OPERATIONS_SECTIONS = ['projects', 'agreements', 'trade-disputes', 'transactions', 'support'] as const
export type OperationsSection = typeof OPERATIONS_SECTIONS[number]
export type OperationsIdentity = { userId: string; email: string }
export type OperationsWorkspace = { id: string; name: string; projectIds: string[] }
type Grant = { email: string; workspaceId: string; sections: OperationsSection[] }
export type OperationsPolicy = { founders: Set<string>; workspaces: OperationsWorkspace[]; grants: Grant[] }
const fail = (message: string, status = 403): never => { throw Object.assign(new Error(message), { status }) }
const email = (value: unknown) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
const projectId = (value: unknown): value is string => typeof value === 'string' && /^dev_[a-z0-9]{8,64}$/i.test(value)

/** Configuration is deliberately explicit. Names, domains and shared owners never merge tenants. */
export function operationsPolicy(env: NodeJS.ProcessEnv = process.env): OperationsPolicy {
  const founders = new Set((env.OPERATIONS_FOUNDER_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean))
  if (!founders.size || [...founders].some(v => !email(v))) fail('Operations founder access is not configured.', 503)
  let workspaces: OperationsWorkspace[], grants: Grant[]
  try {
    workspaces = JSON.parse(env.OPERATIONS_WORKSPACES_JSON || '[]')
    grants = JSON.parse(env.OPERATIONS_GRANTS_JSON || '[]')
  } catch { return fail('Operations access configuration is invalid.', 503) }
  if (!Array.isArray(workspaces) || !Array.isArray(grants)) fail('Operations access configuration is invalid.', 503)
  const ids = new Set<string>(), projects = new Set<string>()
  for (const w of workspaces) {
    if (!w || typeof w.id !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(w.id) || w.id === 'pocket'
      || typeof w.name !== 'string' || !w.name.trim() || w.name.length > 100 || ids.has(w.id)
      || !Array.isArray(w.projectIds) || !w.projectIds.length) fail('Operations workspace configuration is invalid.', 503)
    ids.add(w.id)
    for (const id of w.projectIds) {
      if (!projectId(id) || projects.has(id)) fail('A project must belong to exactly one operations workspace.', 503)
      projects.add(id)
    }
  }
  for (const g of grants) {
    if (!g || !email(g.email) || typeof g.workspaceId !== 'string'
      || !(g.workspaceId === 'pocket' || ids.has(g.workspaceId) || (projectId(g.workspaceId) && !projects.has(g.workspaceId)))
      || !Array.isArray(g.sections) || !g.sections.length || g.sections.some(s => !OPERATIONS_SECTIONS.includes(s))) {
      fail('Operations grant configuration is invalid.', 503)
    }
    if (g.sections.some(s => g.workspaceId === 'pocket' ? !['support', 'transactions'].includes(s) : ['support', 'transactions'].includes(s))) {
      fail('Pocket permissions cannot be assigned to external workspaces.', 503)
    }
  }
  return { founders, workspaces, grants }
}

export function isOperationsFounder(identity: OperationsIdentity, policy: OperationsPolicy) {
  return policy.founders.has(identity.email.trim().toLowerCase())
}

export function workspaceProjectIds(workspaceId: string, policy: OperationsPolicy) {
  if (workspaceId === 'pocket') return []
  const workspace = policy.workspaces.find(w => w.id === workspaceId)
  if (workspace) return workspace.projectIds
  if (projectId(workspaceId) && !policy.workspaces.some(w => w.projectIds.includes(workspaceId))) return [workspaceId]
  return fail('Operations workspace not found.', 404)
}

export function workspaceSections(identity: OperationsIdentity, workspaceId: string, policy: OperationsPolicy): OperationsSection[] {
  const available: OperationsSection[] = workspaceId === 'pocket' ? ['support', 'transactions'] : ['projects', 'agreements', 'trade-disputes']
  if (isOperationsFounder(identity, policy)) return available
  return available.filter(section => policy.grants.some(g => g.email.toLowerCase() === identity.email.toLowerCase()
    && g.workspaceId === workspaceId && g.sections.includes(section)))
}

export function requestedWorkspace(req: Pick<Request, 'query'>) {
  const value = req.query?.workspace
  if (typeof value !== 'string' || !value || value.length > 80) fail('Select an operations workspace.', 400)
  return value as string
}

export function authorizeOperations(identity: OperationsIdentity, req: Pick<Request, 'query'>, section: OperationsSection, recordProjectId?: string, env = process.env) {
  const policy = operationsPolicy(env), workspaceId = requestedWorkspace(req)
  const projectIds = workspaceProjectIds(workspaceId, policy)
  if (!workspaceSections(identity, workspaceId, policy).includes(section)) fail('This account cannot access this workspace section.')
  if (recordProjectId !== undefined && !projectIds.includes(recordProjectId)) fail('Record not found in this workspace.', 404)
  return { workspaceId, projectIds }
}
