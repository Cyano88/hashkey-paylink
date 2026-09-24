import { createHash, randomBytes } from 'node:crypto'
import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/server-auth'
import { resolveDeveloperApiKeyPolicy } from './developer-projects.js'
import { hasRenderDurableStore, readDurableJson, mutateDurableJson } from './render-durable-store.js'
import { assertLiveDeveloperRequest } from './developer-environment.js'
import { agreementPrivyAuthority } from './xstocks-agreement/authority.js'

type Session = { id: string; projectId: string; projectName: string; subject: string; emailHash: string; challenge: string; accessHash: string; appId: string; expiresAt: number; userId?: string; approvedAt?: number; consumedAt?: number }
type Deps = {
  policy: typeof resolveDeveloperApiKeyPolicy; identity: (req: Request) => Promise<{ userId: string; email?: string; emailVerifiedAt?: number }>;
  hasStore: () => boolean; now: () => number; appId: () => string;
  read: (key: string) => Promise<Session | undefined>;
  mutate: (key: string, update: (current: Session | undefined) => Session) => Promise<Session>;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const key = (id: string) => `hashpaylink:wallet-connection:v1:${id}`
function fail(status: number, message: string): never { throw Object.assign(new Error(message), { status }) }
function field(value: unknown, pattern: RegExp, name: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) fail(400, `Invalid ${name}.`)
  return value as string
}
function sessionId(value: unknown) { return field(value, /^wcs_[a-f0-9]{48}$/, 'connection') }
async function connectionIdentity(req: Request) {
  const authority = agreementPrivyAuthority(process.env)
  const token = String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) fail(401, 'Sign in to connect your account.')
  try {
    const client = new PrivyClient(authority.appId, authority.env.PRIVY_APP_SECRET!)
    const claims = await client.verifyAuthToken(token)
    const user = await client.getUserById(claims.userId)
    const emails = user.linkedAccounts.filter(account => account.type === 'email')
    if (emails.length !== 1) fail(403, 'Use an account with one verified email.')
    const email = emails[0]
    return { userId: claims.userId, email: email.address, emailVerifiedAt: email.latestVerifiedAt?.getTime() }
  } catch (error) {
    if ((error as {status?: number}).status === 403) throw error
    return fail(401, 'Sign in again to connect your account.')
  }
}
export function createWalletConnectionHandlers(overrides: Partial<Deps> = {}) {
  const d: Deps = { policy: resolveDeveloperApiKeyPolicy, identity: connectionIdentity, hasStore: hasRenderDurableStore,
    now: Date.now, appId: () => agreementPrivyAuthority(process.env).appId,
    read: readDurableJson, mutate: mutateDurableJson, ...overrides }
  function valid(s: Session | undefined): Session {
    if (!s || s.expiresAt <= d.now()) fail(404, 'Connection is invalid or expired. Start again in your app.')
    if (s.appId !== d.appId()) fail(409, 'Wallet configuration changed. Start again in your app.')
    return s
  }
  const wrap = (run: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      if (req.method !== 'POST') fail(405, 'Method not allowed.')
      assertLiveDeveloperRequest(req)
      if (!d.hasStore()) fail(503, 'Storage unavailable.')
      return await run(req, res)
    } catch (error) {
      const status = Number((error as { status?: number }).status) || 500
      return res.status(status).json({ ok: false, error: status >= 500 ? 'Account connection is temporarily unavailable.' : (error as Error).message })
    }
  }
  const developer = wrap(async (req, res) => {
    const p = await d.policy(req)
    if (!p || p.environment !== 'live' || p.checkoutMode !== 'human' || !p.capabilities.some(c => c === 'arc_agreements' || c === 'xstocks_agreements')) fail(403, 'A live Agreement project key is required.')
    if (req.body?.action === 'create') {
      const subject = field(req.body.subject, /^[A-Za-z0-9:_-]{1,150}$/, 'project account reference')
      const email = field(req.body.email, /^[^\s@]{1,128}@[^\s@]{1,125}$/, 'verified account email').toLowerCase()
      const challenge = field(req.body.challenge, /^[a-f0-9]{64}$/, 'SHA-256 verifier challenge')
      const id = 'wcs_' + randomBytes(24).toString('hex'), access = randomBytes(32).toString('base64url')
      const s = await d.mutate(key(id), current => {
        if (current) fail(409, 'Please start a new connection.')
        return { id, projectId: p.partnerId, projectName: p.merchantName, subject, emailHash: hash(email), challenge,
          accessHash: hash(access), appId: d.appId(), expiresAt: d.now() + 600_000 }
      })
      return res.status(201).json({ ok: true, id, expiresAt: s.expiresAt, connectPath: `/wallet/connect/${id}#access=${access}` })
    }
    if (req.body?.action !== 'redeem') fail(400, 'Choose create or redeem.')
    const id = sessionId(req.body.id)
    const verifier = field(req.body.verifier, /^[A-Za-z0-9_-]{43,128}$/, 'server verifier')
    const s = await d.mutate(key(id), current => {
      const record = valid(current)
      if (record.projectId !== p.partnerId || record.challenge !== hash(verifier)) fail(404, 'Connection not found.')
      if (!record.userId) fail(409, 'Waiting for the account holder to approve.')
      return { ...record, consumedAt: record.consumedAt ?? d.now() }
    })
    return res.json({ ok: true, subject: s.subject, hashPayLinkUserId: s.userId, walletAppId: s.appId })
  })
  const participant = wrap(async (req, res) => {
    if (req.headers['x-api-key']) fail(401, 'Sign in to connect your account.')
    const id = sessionId(req.body?.id), access = field(req.body?.access, /^[A-Za-z0-9_-]{43}$/, 'connection access')
    if (!['read', 'approve'].includes(req.body?.action)) fail(400, 'Choose read or approve.')
    const identity = await d.identity(req)
    function authorized(current: Session | undefined) {
      const s = valid(current)
      if (s.accessHash !== hash(access)) fail(404, 'Connection not found.')
      if (!identity.email || !identity.emailVerifiedAt || s.emailHash !== hash(identity.email.toLowerCase())) fail(403, 'Sign in with the verified email you use in the requesting app.')
      if (s.userId && s.userId !== identity.userId) fail(409, 'This connection was approved by another account.')
      return s
    }
    const s = req.body.action === 'read' ? authorized(await d.read(key(id))) : await d.mutate(key(id), current => {
      const record = authorized(current)
      return { ...record, userId: identity.userId, approvedAt: record.approvedAt ?? d.now() }
    })
    return res.json({ ok: true, projectName: s.projectName, approved: Boolean(s.userId), expiresAt: s.expiresAt })
  })
  return { developer, participant }
}
