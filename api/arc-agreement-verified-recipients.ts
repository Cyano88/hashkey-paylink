import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { getAddress, isAddress } from 'viem'
import { resolveDeveloperApiKeyPolicy, type DeveloperCheckoutPolicy } from './developer-projects.js'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from './render-durable-store.js'

const DEFAULT_STORE_KEY = 'hashpaylink:arc-agreement-verified-recipients:v1'
const MAX_CLOCK_SKEW_SECONDS = 300
const MAX_RECIPIENTS_PER_PROJECT = 10_000

type RecipientRecord = { address: string; accountReference: string; registeredAt: string }
type RecipientStore = { schema: 1; projects: Record<string, Record<string, RecipientRecord>> }
type Dependencies = {
  hasStore: () => boolean
  read: (key: string) => Promise<RecipientStore | undefined>
  mutate: (key: string, update: (current: RecipientStore | undefined) => RecipientStore) => Promise<RecipientStore>
  policy: (req: Pick<Request, 'headers'>) => Promise<DeveloperCheckoutPolicy | null>
  env: () => NodeJS.ProcessEnv
  now: () => Date
}
const defaults: Dependencies = { hasStore: hasRenderDurableStore, read: readDurableJson, mutate: mutateDurableJson, policy: resolveDeveloperApiKeyPolicy, env: () => process.env, now: () => new Date() }

function clean(value: unknown, maximum: number) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum) }
function fail(message: string, status: number): never { throw Object.assign(new Error(message), { status }) }
function storeKey(env: NodeJS.ProcessEnv) { return clean(env.ARC_AGREEMENT_VERIFIED_RECIPIENT_STORE_KEY ?? DEFAULT_STORE_KEY, 160) }
function safeStore(value?: RecipientStore): RecipientStore { return value?.schema === 1 && value.projects ? { schema: 1, projects: { ...value.projects } } : { schema: 1, projects: {} } }
function signaturePayload(apiKey: string, timestamp: string, recipient: string, accountReference: string) { return 'v1\n' + createHash('sha256').update(apiKey).digest('hex') + '\n' + timestamp + '\n' + recipient.toLowerCase() + '\n' + accountReference }

export function signVerifiedArcRecipientRegistration(input: { secret: string; apiKey: string; timestamp: string; recipient: string; accountReference: string }) {
  return createHmac('sha256', input.secret).update(signaturePayload(input.apiKey, input.timestamp, getAddress(input.recipient), input.accountReference)).digest('hex')
}
function signatureMatches(actual: string, expected: string) { return /^[a-f0-9]{64}$/i.test(actual) && actual.length === expected.length && timingSafeEqual(Buffer.from(actual.toLowerCase(), 'utf8'), Buffer.from(expected, 'utf8')) }

export async function isVerifiedArcAgreementRecipient(partnerId: string, recipient: string) {
  if (!isAddress(recipient) || !hasRenderDurableStore()) return false
  const stored = await readDurableJson<RecipientStore>(storeKey(process.env))
  return Boolean(stored?.projects?.[partnerId]?.[getAddress(recipient).toLowerCase()])
}

export function createVerifiedArcRecipientsHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function verifiedArcRecipients(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }) }
    try {
      if (!dependencies.hasStore()) fail('Verified recipient storage is unavailable.', 503)
      const policy = await dependencies.policy(req)
      if (!policy) fail('A valid developer API key is required.', 401)
      if (policy.environment !== 'test' || policy.checkoutMode !== 'human' || !policy.capabilities.includes('arc_agreements')) fail('Verified recipients are available only to human Arc Agreement projects.', 403)
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {}
      const recipientText = clean(body.recipient, 42)
      const accountReference = clean(body.accountReference, 64).toLowerCase()
      const timestamp = clean(req.headers['x-recipient-timestamp'], 20)
      const signature = clean(req.headers['x-recipient-signature'], 64)
      if (!isAddress(recipientText) || !/^[a-f0-9]{64}$/.test(accountReference) || !/^\d{10}$/.test(timestamp)) fail('Verified recipient registration is invalid.', 400)
      const nowSeconds = Math.floor(dependencies.now().getTime() / 1000)
      if (Math.abs(nowSeconds - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS) fail('Verified recipient registration has expired.', 401)
      const secret = clean(dependencies.env().ARC_AGREEMENT_VERIFIED_RECIPIENT_SECRET, 300)
      if (secret.length < 32) fail('Verified recipient registration is unavailable.', 503)
      const recipient = getAddress(recipientText)
      const apiKey = clean(req.headers['x-api-key'], 240)
      const expected = signVerifiedArcRecipientRegistration({ secret, apiKey, timestamp, recipient, accountReference })
      if (!signatureMatches(signature, expected)) fail('Verified recipient registration is not authorized.', 401)
      let replayed = false
      await dependencies.mutate(storeKey(dependencies.env()), current => {
        const next = safeStore(current); const project = { ...(next.projects[policy.partnerId] ?? {}) }; const key = recipient.toLowerCase(); const existing = project[key]
        if (existing) { if (existing.accountReference !== accountReference) fail('This recipient is already bound to another verified account.', 409); replayed = true; return next }
        if (Object.keys(project).length >= MAX_RECIPIENTS_PER_PROJECT) fail('This project has reached its verified recipient limit.', 409)
        project[key] = { address: recipient, accountReference, registeredAt: dependencies.now().toISOString() }; next.projects[policy.partnerId] = project; return next
      })
      return res.status(replayed ? 200 : 201).json({ ok: true, replayed, recipient })
    } catch (error) { const status = Number((error as { status?: number }).status) || 500; return res.status(status).json({ ok: false, error: status >= 500 ? 'Verified recipient registration is temporarily unavailable.' : (error as Error).message }) }
  }
}

export default createVerifiedArcRecipientsHandler()