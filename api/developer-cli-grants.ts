import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { hasRenderDurableStore, readDurableJson, mutateDurableJson } from './render-durable-store.js'

const STORE = 'hashpaylink:cli-grants:v1'
export const CLI_SCOPES = ['project:read', 'checkout:read', 'checkout:create', 'agreement:read', 'agreement:create', 'agreement:recipient', 'agreement:fund', 'xstocks-agreement:read', 'wallet:connect', 'wallet:arc', 'wallet:stocks:read', 'xstocks-agreement:create', 'keys:manage'] as const
export type CliScope = typeof CLI_SCOPES[number]
type Grant = {
  id: string; projectId: string; challenge: string; codeHash: string; scopes: CliScope[];
  createdAt: number; requestExpiresAt: number; expiresAt?: number; ownerId?: string;
  state: 'pending' | 'approved' | 'revoked'; approvedAt?: number; revokedAt?: number
}
type Audit = { grantId: string; projectId: string; action: string; at: number; ownerId?: string }
type Store = { grants: Record<string, Grant>; audit?: Audit[] }
function audit(store: Store | undefined, grant: Grant, action: string, at: number) {
  return [...(store?.audit ?? []), { grantId: grant.id, projectId: grant.projectId, action, at, ownerId: grant.ownerId }].slice(-2000)
}
type Owner = { ownerId: string; name: string; checkoutMode: string; operationalStatus: string }
type Deps = {
  hasStore: () => boolean; read: () => Promise<Store | undefined>;
  mutate: (update: (store: Store | undefined) => Store) => Promise<Store>;
  owner: (req: Request, projectId: string) => Promise<Owner>; now: () => number
}
export const cliGrantStorage = {
  hasStore: hasRenderDurableStore,
  read: () => readDurableJson<Store>(STORE),
  mutate: (update: (store: Store | undefined) => Store) => mutateDurableJson<Store>(STORE, update),
  now: Date.now,
}
export const cliTokenChallenge = (token: string) => createHash('sha256').update(token).digest('hex')
const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }) }
function equals(a: string, b: string) {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
function publicGrant(g: Grant, now: number) {
  return { id: g.id, projectId: g.projectId, scopes: g.scopes,
    state: (g.expiresAt ?? g.requestExpiresAt) <= now ? 'expired' : g.state,
    requestExpiresAt: new Date(g.requestExpiresAt).toISOString(),
    ...(g.expiresAt ? { expiresAt: new Date(g.expiresAt).toISOString() } : {}) }
}
export function cliRequestScope(req: Partial<Pick<Request, 'method' | 'originalUrl' | 'query' | 'body'>>): CliScope | null {
  let url: URL
  try { url = new URL(req.originalUrl ?? '', 'https://developer.hashpaylink.com') } catch { return null }
  if (req.method === 'GET' && url.pathname === '/api/v2/project' && !url.search) return 'project:read'
  if (req.method === 'POST' && url.pathname === '/api/v2/cli/keys' && !url.search) return 'keys:manage'
  if (req.method === 'POST' && url.pathname === '/api/v2/wallet-connections' && !url.search
    && ['create', 'redeem'].includes(req.body?.action)) return 'wallet:connect'
  if (req.method === 'POST' && !url.search) {
    if (url.pathname === '/api/v2/agreements/verified-recipient') return 'agreement:recipient'
    // Funding only. Lifecycle release, cancellation, refund and link rotation remain excluded.
    if (url.pathname === '/api/v2/agreements/project-payer'
      && ['brand', 'link-wallet', 'review', 'status', 'prepare', 'challenge', 'recover', 'record'].includes(req.body?.action)) return 'agreement:fund'
  }
  if (req.method === 'POST' && url.pathname === '/api/v2/wallets/arc' && !url.search) return 'wallet:arc'
  if (req.method === 'POST' && url.pathname === '/api/v2/wallets/stocks/balances' && !url.search) return 'wallet:stocks:read'
  if (url.pathname === '/api/v2/xstocks-agreements') {
    if (req.method === 'GET') return 'xstocks-agreement:read'
    if (req.method === 'POST' && !url.search && req.body?.action === undefined) return 'xstocks-agreement:create'
    return null
  }
  if (url.pathname === '/api/v2/agreements') {
    if (req.method === 'GET') return 'agreement:read'
    // Draft creation only. Payer links, release requests and all nested signing routes stay excluded.
    if (req.method === 'POST' && !url.search && req.body?.action === undefined
      && (req.body?.checkoutMode ?? 'human') === 'human') return 'agreement:create'
    return null
  }
  if (url.pathname !== '/api/v2/checkouts') return null
  if (req.method === 'GET' && url.searchParams.getAll('purpose').length === 1
    && url.searchParams.get('purpose') === 'status' && req.query?.purpose === 'status') return 'checkout:read'
  if (req.method === 'POST' && !url.search && (req.body?.checkoutMode ?? 'human') === 'human') return 'checkout:create'
  return null
}
export async function resolveCliGrant(token: string, scope: CliScope | null, storage = cliGrantStorage) {
  if (!scope || !/^hpl_cli_[a-f0-9]{64}$/.test(token) || !storage.hasStore()) return null
  const challenge = cliTokenChallenge(token)
  const grant = Object.values((await storage.read())?.grants ?? {}).find(g => equals(g.challenge, challenge))
  if (!grant || grant.state !== 'approved' || !grant.ownerId || !grant.expiresAt
    || grant.expiresAt <= storage.now() || !grant.scopes.includes(scope)) return null
  return { id: grant.id, projectId: grant.projectId, ownerId: grant.ownerId, scopes: grant.scopes }
}
export function createCliGrantHandler(deps: Deps) {
  return async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    }
    try {
      if (!deps.hasStore()) fail(503, 'CLI authorization is temporarily unavailable.')
      const now = deps.now()
      const action = req.body?.action
      if (action === 'begin') {
        const { projectId, challenge, scopes } = req.body ?? {}
        if (typeof projectId !== 'string' || !/^dev_[a-z0-9]{8,64}$/i.test(projectId)) fail(400, 'Select a valid existing project.')
        if (typeof challenge !== 'string' || !/^[a-f0-9]{64}$/.test(challenge)) fail(400, 'Invalid authorization challenge.')
        if (!Array.isArray(scopes) || !scopes.length || scopes.length > CLI_SCOPES.length
          || scopes.some(s => !CLI_SCOPES.includes(s)) || new Set(scopes).size !== scopes.length) fail(400, 'Choose supported CLI permissions.')
        const id = randomUUID()
        const userCode = randomBytes(6).toString('hex').toUpperCase()
        const grant: Grant = { id, projectId, challenge, codeHash: cliTokenChallenge(userCode),
          scopes: [...scopes], state: 'pending', createdAt: now, requestExpiresAt: now + 600_000 }
        await deps.mutate(current => {
          const grants = Object.fromEntries(Object.entries(current?.grants ?? {}).filter(([, g]) => (g.expiresAt ?? g.requestExpiresAt) > now))
          if (Object.keys(grants).length >= 2000) fail(503, 'CLI authorization is busy. Try again later.')
          if (Object.values(grants).some(g => g.challenge === challenge)) fail(409, 'Start a new authorization request.')
          return { grants: { ...grants, [id]: grant }, audit: current?.audit ?? [] }
        })
        return res.status(201).json({ ok: true, grant: publicGrant(grant, now), userCode,
          verificationUrl: 'https://developer.hashpaylink.com/cli/authorize?id=' + id })
      }
      if (action === 'status' || action === 'logout') {
        const token = String(req.headers.authorization ?? '').match(/^Bearer (hpl_cli_[a-f0-9]{64})$/)?.[1]
        if (!token) fail(401, 'CLI authentication is required.')
        const challenge = cliTokenChallenge(token!)
        let grant = Object.values((await deps.read())?.grants ?? {}).find(g => equals(g.challenge, challenge))
        if (!grant) fail(401, 'CLI authorization was not found.')
        if (action === 'logout') {
          await deps.mutate(current => {
            const latest = current?.grants[grant!.id]
            if (!latest) fail(401, 'CLI authorization was not found.')
            grant = { ...latest!, state: 'revoked', revokedAt: now }
            return { grants: { ...current!.grants, [grant!.id]: grant! }, audit: audit(current, grant!, 'logout', now) }
          })
        }
        return res.json({ ok: true, grant: publicGrant(grant!, now) })
      }
      // All following actions need a real Privy owner session, never a CLI token.
      const id = typeof req.body?.id === 'string' ? req.body.id : ''
      const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId : ''
      const store = await deps.read()
      const grant = store?.grants[id]
      if (!['inspect', 'approve', 'revoke', 'list'].includes(action)) fail(400, 'Unknown authorization action.')
      if (action !== 'list' && !grant) fail(404, 'Authorization request was not found.')
      const owner = await deps.owner(req, action === 'list' ? projectId : grant!.projectId)
      if (action === 'list') return res.json({ ok: true, grants: Object.values(store?.grants ?? {})
        .filter(g => g.projectId === projectId && (!g.ownerId || g.ownerId === owner.ownerId)).map(g => publicGrant(g, now)), audit: (store?.audit ?? []).filter(event => event.projectId === projectId && (!event.ownerId || event.ownerId === owner.ownerId)) })
      if (grant!.ownerId && grant!.ownerId !== owner.ownerId) fail(403, 'Authorization owner does not match.')
      if (action === 'inspect') return res.json({ ok: true, projectName: owner.name, grant: publicGrant(grant!, now) })
      if (action === 'approve') {
        if (owner.operationalStatus !== 'active' || owner.checkoutMode !== 'human') fail(409, 'An active human checkout project is required.')
        const code = String(req.body?.userCode ?? '').trim().toUpperCase()
        if (!/^[A-F0-9]{12}$/.test(code) || !equals(grant!.codeHash, cliTokenChallenge(code))) fail(403, 'Enter the confirmation code shown by your CLI.')
      }
      let updated!: Grant
      await deps.mutate(current => {
        const latest = current?.grants[id]
        if (!latest || (latest.ownerId && latest.ownerId !== owner.ownerId)) fail(404, 'Authorization request was not found.')
        if (action === 'approve') {
          if (latest!.state !== 'pending' || latest!.requestExpiresAt <= now) fail(409, 'Authorization request is no longer pending.')
          updated = { ...latest!, ownerId: owner.ownerId, state: 'approved', approvedAt: now, expiresAt: now + 3600_000 }
        } else updated = { ...latest!, state: 'revoked', revokedAt: now }
        return { grants: { ...current!.grants, [id]: updated }, audit: audit(current, updated, action, now) }
      })
      return res.json({ ok: true, grant: publicGrant(updated, now) })
    } catch (error) {
      const status = Number((error as { status?: number }).status) || 503
      return res.status(status).json({ ok: false, error: status < 500 ? (error as Error).message : 'CLI authorization is temporarily unavailable.' })
    }
  }
}
