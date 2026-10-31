import type { Request } from 'express'

export const OPERATIONS_SECTIONS = ['projects', 'agreements', 'trade-disputes', 'transactions', 'support', 'cases', 'products'] as const
export type OperationsSection = typeof OPERATIONS_SECTIONS[number]
export type OperationsIdentity = { userId: string; email: string }
export type OperationsWorkspace = { id: string; name: string; projectIds: string[] }
export const OPERATIONS_ROLES = ['administrator', 'engineering', 'compliance', 'legal', 'support', 'product'] as const
export type OperationsRole = typeof OPERATIONS_ROLES[number]
type Grant = { email: string; workspaceId: string; sections?: OperationsSection[]; roles?: OperationsRole[] }
const roleSections: Record<OperationsRole, OperationsSection[]> = {
  administrator: ['projects','support','cases','transactions','products'],
  engineering: ['projects','transactions'], compliance: ['projects','cases'], legal: ['cases'], support: ['support','transactions','cases'], product: ['products'],
}
// Request-local policy snapshots are loaded by authenticated server code, never from request input.
const requestPolicies = new WeakMap<object, NodeJS.ProcessEnv>()
export function setOperationsRequestPolicy(req: object, env: NodeJS.ProcessEnv) { requestPolicies.set(req, env) }
export function operationsRequestPolicy(req: object) { return requestPolicies.get(req) ?? process.env }
function grantSections(grant: Grant) { return grant.roles ? [...new Set(grant.roles.flatMap(role=>roleSections[role]))] : grant.sections ?? [] }
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
      || (g.roles !== undefined ? (!Array.isArray(g.roles) || !g.roles.length || g.roles.some(r=>!OPERATIONS_ROLES.includes(r)) || g.sections !== undefined)
        : (!Array.isArray(g.sections) || !g.sections.length || g.sections.some(s => !OPERATIONS_SECTIONS.includes(s))))) {
      fail('Operations grant configuration is invalid.', 503)
    }
    if (!g.roles && g.sections!.some(s => g.workspaceId === 'pocket' ? !['support', 'transactions'].includes(s) : ['support', 'transactions'].includes(s))) {
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
  const available: OperationsSection[] = workspaceId === 'pocket' ? ['support', 'transactions', 'cases'] : ['projects', 'agreements', 'trade-disputes', 'cases', 'products']
  if (isOperationsFounder(identity, policy)) return available
  return available.filter(section => policy.grants.some(g => g.email.toLowerCase() === identity.email.toLowerCase()
    && g.workspaceId === workspaceId && grantSections(g).includes(section)))
}

export function requestedWorkspace(req: Pick<Request, 'query'>) {
  const value = req.query?.workspace
  if (typeof value !== 'string' || !value || value.length > 80) fail('Select an operations workspace.', 400)
  return value as string
}

export function authorizeOperations(identity: OperationsIdentity, req: Pick<Request, 'query'> & Partial<Pick<Request,'method'|'body'>>, section: OperationsSection, recordProjectId?: string, env = operationsRequestPolicy(req)) {
  const policy = operationsPolicy(env), workspaceId = requestedWorkspace(req)
  const projectIds = workspaceProjectIds(workspaceId, policy)
  if (!workspaceSections(identity, workspaceId, policy).includes(section)) fail('This account cannot access this workspace section.')
  if (recordProjectId !== undefined && !projectIds.includes(recordProjectId)) fail('Record not found in this workspace.', 404)
  const action = typeof req.body?.action === 'string' ? req.body.action.toLowerCase() : ''
  if(action.startsWith('admin-verification-') && !isOperationsFounder(identity,policy) && !policy.grants.some(g=>g.email.toLowerCase()===identity.email.toLowerCase()&&g.workspaceId===workspaceId&&g.roles?.includes('compliance')))fail('Only Compliance or an owner can access verification documents and decisions.')
  const read = !req.method || req.method === 'GET' || (req.method === 'POST' && ['admin-list','list','read','admin-verification-read','admin-verification-download','staff-list','staff-knowledge-list'].includes(action))
  if (!read && !isOperationsFounder(identity,policy)) {
    const grants=policy.grants.filter(g=>g.email.toLowerCase()===identity.email.toLowerCase() && g.workspaceId===workspaceId)
    const legacy=grants.some(g=>!g.roles && g.sections?.includes(section))
    const roles=grants.flatMap(g=>g.roles??[])
    const allowed=section==='cases' ? (['case-create','case-note','case-assign','case-resolve','case-escalate'].includes(action) && roles.some(r=>['support','administrator'].includes(r))) || (action==='case-review' && roles.some(r=>['compliance','legal'].includes(r)))
      : section==='support' ? roles.some(r=>['support','administrator'].includes(r)) && ['staff-reply','staff-assign','staff-resolve','staff-profile','staff-knowledge-draft'].includes(action)
      : section==='transactions' ? roles.includes('engineering') && action==='reconcile'
      : section==='projects' ? roles.includes('compliance') && ['admin-activate','admin-suspend','admin-reactivate','admin-verification-review'].includes(action) : false
    if(!legacy && !allowed) fail('Your role cannot perform this action.')
  }
  return { workspaceId, projectIds }
}

export function emergencyPermissions(identity:OperationsIdentity,env:NodeJS.ProcessEnv){
 const owner=isOperationsFounder(identity,operationsPolicy(env))
 const listed=(key:string)=>(env[key]??'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).includes(identity.email.toLowerCase())
 return {pause:owner||listed('OPERATIONS_PAUSE_RESPONDER_EMAILS'),resume:owner||listed('OPERATIONS_RESUME_APPROVER_EMAILS')}
}
