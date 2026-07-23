import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { BlockList } from 'node:net'
import { request as httpsRequest } from 'node:https'
import type { Request, Response } from 'express'
import { PrivyClient, type User } from '@privy-io/server-auth'
import { getAddress, isAddress } from 'viem'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from './render-durable-store.js'
import { createPaycrestOfframpOrder, getPaycrestOfframpRate, isPaycrestConfigured, listPaycrestInstitutions, verifyPaycrestAccount, type PaycrestInstitution } from './paycrest-pos.js'

const STORE_KEY = (process.env.DEVELOPER_PROJECT_STORE_KEY ?? 'hashpaylink:developer-projects:v1').trim()
const NETWORKS = ['base', 'arbitrum', 'arc'] as const
type DeveloperNetwork = typeof NETWORKS[number]
type SettlementMode = 'usdc' | 'ngn'
type DeveloperEnvironment = 'test' | 'live'
export type DeveloperCheckoutMode = 'human' | 'agentic'
export type DeveloperCapability = 'hosted_checkout' | 'polymarket_funding'

type DeveloperKey = {
  id: string
  name: string
  prefix: string
  digest: string
  environment: DeveloperEnvironment
  createdAt: string
  lastUsedAt?: string
  revokedAt?: string
}

type DeveloperProject = {
  id: string
  ownerId: string
  ownerEmail: string
  name: string
  website: string
  brandImageUrl?: string
  useCase: string
  checkoutMode?: DeveloperCheckoutMode
  capabilities?: DeveloperCapability[]
  settlementMode: SettlementMode
  settlementStatus: 'ready' | 'review_required'
  networks: DeveloperNetwork[]
  defaultNetwork: DeveloperNetwork
  recipients: Partial<Record<DeveloperNetwork, string>>
  refundAddress: string
  allowedOrigins: string[]
  webhookUrl: string
  webhookSecretCipher: string
  bankCode: string
  bankName: string
  bankAccountName: string
  bankAccountLast4: string
  bankAccountCipher: string
  bankVerifiedAt?: string
  keys: DeveloperKey[]
  webhookDeliveries?: Array<{ id: string; event: string; status: 'delivered' | 'failed'; responseStatus?: number; attemptedAt: string; error?: string }>
  createdAt: string
  updatedAt: string
}

type DeveloperStore = { projects: Record<string, DeveloperProject> }

export type DeveloperCheckoutPolicy = {
  partnerId: string
  merchantName: string
  brandImageUrl?: string
  allowedOrigins: string[]
  defaultNetwork: DeveloperNetwork
  paymentOptions: Array<{ network: DeveloperNetwork; recipient: string }>
  settlementMode: SettlementMode
  checkoutMode: DeveloperCheckoutMode
  capabilities: DeveloperCapability[]
  nairaSettlement?: {
    bankCode: string
    bankName: string
    accountName: string
    accountNumber: string
    refundAddress: string
  }
  projectManaged: true
}

type VerifiedDeveloper = { userId: string; email: string }
type Dependencies = {
  hasStore: () => boolean
  read: (key: string) => Promise<DeveloperStore | undefined>
  mutate: (key: string, update: (current: DeveloperStore | undefined) => DeveloperStore) => Promise<DeveloperStore>
  verify: (req: Request) => Promise<VerifiedDeveloper>
  validateWebhook: (url: string) => Promise<void>
  paycrestReady: () => boolean
  listBanks: () => Promise<PaycrestInstitution[]>
  verifyBank: (input: { institution: string; accountIdentifier: string }) => Promise<string>
  portalSecret: () => string
  createProjectId: () => string
  createKeyId: () => string
  createSecret: (prefix: string) => string
  now: () => Date
}

function clean(value: unknown, max: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function bearerToken(req: Request) {
  return String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? ''
}

function linkedEmail(user: User) {
  for (const account of user.linkedAccounts ?? []) {
    if (account.type === 'email' && typeof account.address === 'string') return account.address.trim().toLowerCase()
  }
  return ''
}

async function verifyDeveloper(req: Request): Promise<VerifiedDeveloper> {
  const appId = (process.env.PRIVY_APP_ID ?? process.env.VITE_PRIVY_APP_ID ?? '').trim()
  const secret = (process.env.PRIVY_APP_SECRET ?? '').trim()
  if (!appId || !secret) throw Object.assign(new Error('Developer authentication is not configured.'), { status: 503 })
  const token = bearerToken(req)
  if (!token) throw Object.assign(new Error('Sign in to manage developer projects.'), { status: 401 })
  try {
    const client = new PrivyClient(appId, secret)
    const claims = await client.verifyAuthToken(token)
    const user = await client.getUserById(claims.userId)
    return { userId: claims.userId, email: linkedEmail(user) }
  } catch (cause) {
    throw Object.assign(new Error('Your developer session is invalid or expired.'), { status: 401, cause })
  }
}

const blockedWebhookAddresses = new BlockList()
blockedWebhookAddresses.addSubnet('0.0.0.0', 8, 'ipv4')
blockedWebhookAddresses.addSubnet('10.0.0.0', 8, 'ipv4')
blockedWebhookAddresses.addSubnet('100.64.0.0', 10, 'ipv4')
blockedWebhookAddresses.addSubnet('127.0.0.0', 8, 'ipv4')
blockedWebhookAddresses.addSubnet('169.254.0.0', 16, 'ipv4')
blockedWebhookAddresses.addSubnet('172.16.0.0', 12, 'ipv4')
blockedWebhookAddresses.addSubnet('192.168.0.0', 16, 'ipv4')
blockedWebhookAddresses.addSubnet('198.18.0.0', 15, 'ipv4')
blockedWebhookAddresses.addSubnet('224.0.0.0', 4, 'ipv4')
blockedWebhookAddresses.addSubnet('240.0.0.0', 4, 'ipv4')
blockedWebhookAddresses.addAddress('::', 'ipv6')
blockedWebhookAddresses.addAddress('::1', 'ipv6')
blockedWebhookAddresses.addSubnet('fc00::', 7, 'ipv6')
blockedWebhookAddresses.addSubnet('fe80::', 10, 'ipv6')
blockedWebhookAddresses.addSubnet('ff00::', 8, 'ipv6')

export async function validatePublicWebhookDestination(value: string) {
  await resolvePublicWebhookDestination(value)
}

async function resolvePublicWebhookDestination(value: string) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password) throw Object.assign(new Error('Webhook URLs must use public HTTPS endpoints.'), { status: 400 })
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw Object.assign(new Error('Webhook URLs must use public HTTPS endpoints.'), { status: 400 })
  }
  let addresses: Array<{ address: string; family: number }>
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true })
  } catch (cause) {
    throw Object.assign(new Error('Webhook hostname could not be resolved.'), { status: 400, cause })
  }
  if (!addresses.length || addresses.some(item => blockedWebhookAddresses.check(item.address, item.family === 6 ? 'ipv6' : 'ipv4'))) {
    throw Object.assign(new Error('Webhook URLs must use public HTTPS endpoints.'), { status: 400 })
  }
  return { url, address: addresses[0].address, family: addresses[0].family }
}

async function postPublicWebhook(value: string, payload: string, headers: Record<string, string>) {
  const destination = await resolvePublicWebhookDestination(value)
  return new Promise<number>((resolve, reject) => {
    const request = httpsRequest(destination.url, {
      method: 'POST',
      headers: { ...headers, 'content-length': Buffer.byteLength(payload).toString() },
      servername: destination.url.hostname,
      timeout: 10_000,
      lookup: (_hostname, _options, callback) => callback(null, destination.address, destination.family),
    }, response => {
      response.resume()
      response.once('end', () => resolve(response.statusCode ?? 0))
    })
    request.once('timeout', () => request.destroy(new Error('Webhook delivery timed out.')))
    request.once('error', reject)
    request.end(payload)
  })
}

const defaults: Dependencies = {
  hasStore: hasRenderDurableStore,
  read: readDurableJson,
  mutate: (key, update) => mutateDurableJson<DeveloperStore>(key, update),
  verify: verifyDeveloper,
  validateWebhook: validatePublicWebhookDestination,
  paycrestReady: isPaycrestConfigured,
  listBanks: () => listPaycrestInstitutions('NGN'),
  verifyBank: verifyPaycrestAccount,
  portalSecret: () => (process.env.DEVELOPER_PORTAL_SECRET ?? '').trim(),
  createProjectId: () => `dev_${randomUUID().replace(/-/g, '').slice(0, 18)}`,
  createKeyId: () => `key_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
  createSecret: prefix => `${prefix}_${randomBytes(24).toString('base64url')}`,
  now: () => new Date(),
}

function normalizedOrigin(value: unknown) {
  const text = clean(value, 300)
  if (!text) return ''
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return ''
    return url.origin
  } catch {
    return ''
  }
}

function normalizedHttpsUrl(value: unknown, allowEmpty = true) {
  const text = clean(value, 300)
  if (!text && allowEmpty) return ''
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return ''
    return url.toString()
  } catch {
    return ''
  }
}

function normalizedBrandImageUrl(value: unknown, website: string) {
  const text = clean(value, 400)
  if (!text) return ''
  try {
    const url = new URL(text)
    const websiteUrl = new URL(website)
    const localDevelopment = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
    if ((url.protocol !== 'https:' && !localDevelopment) || url.username || url.password || url.origin !== websiteUrl.origin) return ''
    return /\.(?:png|webp|jpe?g)$/i.test(url.pathname) ? url.toString() : ''
  } catch {
    return ''
  }
}

function normalizedWebhookUrl(value: unknown) {
  const text = clean(value, 300)
  if (!text) return ''
  try {
    const url = new URL(text)
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : ''
  } catch {
    return ''
  }
}

function validRecipient(value: unknown) {
  const address = clean(value, 80)
  return isAddress(address) && address.toLowerCase() !== '0x0000000000000000000000000000000000000000' ? getAddress(address) : ''
}

function keyDigest(secret: string, apiKey: string) {
  return createHmac('sha256', secret).update(apiKey).digest('hex')
}

function encryptValue(secret: string, value: string) {
  if (!value) return ''
  const key = createHash('sha256').update(`developer-portal:${secret}`).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map(item => item.toString('base64url')).join('.')
}

function decryptValue(secret: string, value: string) {
  if (!value) return ''
  const [ivText, tagText, encryptedText] = value.split('.')
  if (!ivText || !tagText || !encryptedText) throw new Error('Encrypted project value is invalid.')
  const key = createHash('sha256').update(`developer-portal:${secret}`).digest()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8')
}

function safeDigestEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  return timingSafeEqual(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
}

function projectPublic(project: DeveloperProject) {
  return {
    id: project.id,
    name: project.name,
    ownerEmail: project.ownerEmail,
    website: project.website,
    brandImageUrl: project.brandImageUrl ?? '',
    useCase: project.useCase,
    checkoutMode: projectCheckoutMode(project),
    capabilities: project.capabilities?.length ? project.capabilities : ['hosted_checkout'],
    settlementMode: project.settlementMode,
    settlementStatus: project.settlementStatus,
    networks: project.networks,
    defaultNetwork: project.defaultNetwork,
    recipients: project.recipients,
    refundAddress: project.refundAddress,
    allowedOrigins: project.allowedOrigins,
    webhookUrl: project.webhookUrl,
    webhookConfigured: Boolean(project.webhookSecretCipher),
    bankCode: project.bankCode,
    bankName: project.bankName,
    bankAccountName: project.bankAccountName,
    bankAccountLast4: project.bankAccountLast4,
    bankVerifiedAt: project.bankVerifiedAt,
    keys: project.keys.map(key => ({ id: key.id, name: key.name, prefix: key.prefix, environment: key.environment, createdAt: key.createdAt, lastUsedAt: key.lastUsedAt, revokedAt: key.revokedAt })),
    webhookDeliveries: (project.webhookDeliveries ?? []).slice(-20),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

function findOwnedProject(store: DeveloperStore | undefined, projectId: string, ownerId: string) {
  const project = store?.projects?.[projectId]
  return project?.ownerId === ownerId ? project : undefined
}

function requestedNetworks(value: unknown) {
  if (!Array.isArray(value)) return []
  const networks = value.map(item => clean(item, 20).toLowerCase()).filter((item): item is DeveloperNetwork => NETWORKS.includes(item as DeveloperNetwork))
  return Array.from(new Set(networks))
}

function requestedCheckoutMode(value: unknown): DeveloperCheckoutMode | '' {
  const mode = clean(value, 20).toLowerCase()
  return mode === 'human' || mode === 'agentic' ? mode : ''
}

function projectCheckoutMode(project: Pick<DeveloperProject, 'checkoutMode'>): DeveloperCheckoutMode {
  return project.checkoutMode === 'agentic' ? 'agentic' : 'human'
}

function requestedCapabilities(value: unknown, checkoutMode: DeveloperCheckoutMode): DeveloperCapability[] {
  if (!Array.isArray(value)) return ['hosted_checkout']
  const allowed = new Set<DeveloperCapability>(checkoutMode === 'agentic' ? ['hosted_checkout'] : ['hosted_checkout', 'polymarket_funding'])
  const capabilities = value.map(item => clean(item, 40).toLowerCase()).filter((item): item is DeveloperCapability => allowed.has(item as DeveloperCapability))
  return Array.from(new Set(capabilities)).slice(0, 2)
}

function statusCode(error: unknown) {
  return Number((error as Error & { status?: number })?.status) || 500
}

export function createDeveloperProjectsHandler(dependencies: Dependencies = defaults) {
  return async function developerProjectsHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    try {
      if (!dependencies.hasStore()) return res.status(503).json({ ok: false, error: 'Developer projects are temporarily unavailable.' })
      const secret = dependencies.portalSecret()
      if (secret.length < 32) return res.status(503).json({ ok: false, error: 'Developer project security is not configured.' })
      const identity = await dependencies.verify(req)

      if (req.method === 'GET') {
        if (clean(req.query?.resource, 30) === 'institutions') {
          if (!dependencies.paycrestReady()) return res.status(503).json({ ok: false, error: 'Naira settlement is temporarily unavailable.' })
          const institutions = await dependencies.listBanks()
          return res.json({ ok: true, institutions })
        }
        const store = await dependencies.read(STORE_KEY)
        const projects = Object.values(store?.projects ?? {}).filter(project => project.ownerId === identity.userId)
        return res.json({ ok: true, projects: projects.map(projectPublic) })
      }

      if (req.method !== 'POST' && req.method !== 'PUT') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
      const action = clean(req.body?.action, 40).toLowerCase()

      if (req.method === 'POST' && action === 'create') {
        const name = clean(req.body?.name, 100)
        const website = normalizedHttpsUrl(req.body?.website, false)
        const useCase = clean(req.body?.useCase, 800)
        const checkoutMode = requestedCheckoutMode(req.body?.checkoutMode)
        if (name.length < 2) return res.status(400).json({ ok: false, error: 'Enter your platform name.' })
        if (!website) return res.status(400).json({ ok: false, error: 'Enter a valid HTTPS website.' })
        if (useCase.length < 20) return res.status(400).json({ ok: false, error: 'Briefly explain what customers will pay for.' })
        if (!checkoutMode) return res.status(400).json({ ok: false, error: 'Choose human checkout or agentic x402 for this project.' })
        if (checkoutMode === 'agentic' && Array.isArray(req.body?.capabilities) && req.body.capabilities.some((capability: unknown) => clean(capability, 40).toLowerCase() === 'polymarket_funding')) {
          return res.status(400).json({ ok: false, error: 'Agentic x402 projects cannot enable human funding products.' })
        }
        const capabilities = requestedCapabilities(req.body?.capabilities, checkoutMode)
        if (!capabilities.length) return res.status(400).json({ ok: false, error: 'Choose at least one API product.' })
        const now = dependencies.now().toISOString()
        const project: DeveloperProject = {
          id: dependencies.createProjectId(), ownerId: identity.userId, ownerEmail: identity.email,
          name, website, brandImageUrl: '', useCase, checkoutMode, capabilities, settlementMode: 'usdc', settlementStatus: 'review_required',
          networks: ['base'], defaultNetwork: 'base', recipients: {}, refundAddress: '',
          allowedOrigins: [new URL(website).origin], webhookUrl: '', webhookSecretCipher: '',
          bankCode: '', bankName: '', bankAccountName: '', bankAccountLast4: '', bankAccountCipher: '', bankVerifiedAt: undefined,
          keys: [], webhookDeliveries: [], createdAt: now, updatedAt: now,
        }
        await dependencies.mutate(STORE_KEY, current => ({ projects: { ...(current?.projects ?? {}), [project.id]: project } }))
        return res.status(201).json({ ok: true, project: projectPublic(project) })
      }

      const projectId = clean(req.body?.projectId, 80)
      const currentStore = await dependencies.read(STORE_KEY)
      const currentProject = findOwnedProject(currentStore, projectId, identity.userId)
      if (!currentProject) return res.status(404).json({ ok: false, error: 'Developer project not found.' })

      if (req.method === 'PUT' && action === 'configure') {
        const name = clean(req.body?.name, 100)
        const website = normalizedHttpsUrl(req.body?.website, false)
        const requestedBrandImageUrl = clean(req.body?.brandImageUrl, 400)
        const brandImageUrl = website ? normalizedBrandImageUrl(requestedBrandImageUrl, website) : ''
        const useCase = clean(req.body?.useCase, 800)
        const currentCheckoutMode = projectCheckoutMode(currentProject)
        const requestedMode = req.body?.checkoutMode === undefined ? currentCheckoutMode : requestedCheckoutMode(req.body.checkoutMode)
        if (!requestedMode) return res.status(400).json({ ok: false, error: 'Choose a valid checkout mode.' })
        if (requestedMode !== currentCheckoutMode) return res.status(409).json({ ok: false, error: 'Project checkout mode is immutable. Create a separate project for the other payment path.' })
        if (currentCheckoutMode === 'agentic' && Array.isArray(req.body?.capabilities) && req.body.capabilities.some((capability: unknown) => clean(capability, 40).toLowerCase() === 'polymarket_funding')) {
          return res.status(400).json({ ok: false, error: 'Agentic x402 projects cannot enable human funding products.' })
        }
        const capabilities: DeveloperCapability[] = req.body?.capabilities === undefined
          ? (currentProject.capabilities?.length ? currentProject.capabilities : ['hosted_checkout'])
          : requestedCapabilities(req.body.capabilities, currentCheckoutMode)
        const settlementMode = clean(req.body?.settlementMode, 10) as SettlementMode
        const requestedPaymentNetworks = requestedNetworks(req.body?.networks)
        const networks = settlementMode === 'ngn' ? ['base'] as DeveloperNetwork[] : requestedPaymentNetworks
        const defaultNetwork = settlementMode === 'ngn' ? 'base' : clean(req.body?.defaultNetwork, 20) as DeveloperNetwork
        const recipients = Object.fromEntries(NETWORKS.flatMap(network => {
          const recipient = validRecipient(req.body?.recipients?.[network])
          return recipient ? [[network, recipient]] : []
        })) as Partial<Record<DeveloperNetwork, string>>
        const allowedOrigins: string[] = Array.isArray(req.body?.allowedOrigins)
          ? Array.from(new Set<string>(req.body.allowedOrigins.map((item: unknown) => normalizedOrigin(item)).filter((item: string) => Boolean(item)))).slice(0, 10)
          : []
        const webhookUrl = normalizedWebhookUrl(req.body?.webhookUrl)
        const refundAddress = validRecipient(req.body?.refundAddress)
        const bankCode = settlementMode === 'ngn' ? clean(req.body?.bankCode, 40) : ''
        const bankName = settlementMode === 'ngn' ? clean(req.body?.bankName, 100) : ''
        const bankAccountName = settlementMode === 'ngn' ? clean(req.body?.bankAccountName, 120) : ''
        const bankAccountNumber = settlementMode === 'ngn' ? clean(req.body?.bankAccountNumber, 20).replace(/\D/g, '') : ''
        if (name.length < 2 || !website || useCase.length < 20) return res.status(400).json({ ok: false, error: 'Complete the platform details.' })
        if (requestedBrandImageUrl && !brandImageUrl) return res.status(400).json({ ok: false, error: 'Checkout brand marks must be PNG, WebP, or JPG files hosted on the project website origin.' })
        if (!capabilities.length) return res.status(400).json({ ok: false, error: 'Choose at least one API product.' })
        if (currentCheckoutMode === 'agentic' && settlementMode !== 'usdc') return res.status(400).json({ ok: false, error: 'Agentic x402 projects support USDC settlement only.' })
        if (currentCheckoutMode === 'agentic' && capabilities.some(capability => capability !== 'hosted_checkout')) return res.status(400).json({ ok: false, error: 'Agentic x402 projects cannot enable human funding products.' })
        if (settlementMode !== 'usdc' && settlementMode !== 'ngn') return res.status(400).json({ ok: false, error: 'Choose USDC or Naira settlement.' })
        if (!networks.length || !networks.includes(defaultNetwork)) return res.status(400).json({ ok: false, error: 'Choose a valid default payment network.' })
        if (settlementMode === 'usdc' && networks.some(network => !recipients[network])) return res.status(400).json({ ok: false, error: 'Add a valid receiving address for every selected network.' })
        if (!allowedOrigins.length) return res.status(400).json({ ok: false, error: 'Add at least one allowed return origin.' })
        if (clean(req.body?.webhookUrl, 300) && !webhookUrl) return res.status(400).json({ ok: false, error: 'Enter a valid HTTPS webhook URL.' })
        if (webhookUrl) await dependencies.validateWebhook(webhookUrl)
        if (settlementMode === 'ngn' && !refundAddress) return res.status(400).json({ ok: false, error: 'Add a valid Base USDC refund address for Naira settlement.' })
        if (settlementMode === 'ngn' && (!bankCode || !bankName || (!/^\d{10}$/.test(bankAccountNumber) && !currentProject.bankAccountCipher))) {
          return res.status(400).json({ ok: false, error: 'Add a Nigerian bank and 10-digit account number for Naira settlement.' })
        }

        let verifiedBankName = bankAccountNumber ? bankAccountName : currentProject.bankAccountName
        let bankVerifiedAt = currentProject.bankVerifiedAt
        if (settlementMode === 'ngn') {
          if (!dependencies.paycrestReady()) return res.status(503).json({ ok: false, error: 'Naira settlement is temporarily unavailable.' })
          const bankChanged = bankCode !== currentProject.bankCode || bankName !== currentProject.bankName
          if (!bankAccountNumber && bankChanged) return res.status(400).json({ ok: false, error: 'Re-enter the account number after changing the bank.' })
          if (bankAccountNumber) {
            verifiedBankName = clean(await dependencies.verifyBank({ institution: bankCode, accountIdentifier: bankAccountNumber }), 120)
            if (!verifiedBankName || verifiedBankName.toLowerCase() === 'ok') verifiedBankName = bankAccountName
            if (!verifiedBankName) return res.status(400).json({ ok: false, error: 'Paycrest verified the account but did not return its name. Enter the account name and save again.' })
            bankVerifiedAt = dependencies.now().toISOString()
          }
          if (!bankVerifiedAt) return res.status(400).json({ ok: false, error: 'Verify the bank account before activating Naira settlement.' })
        }

        const store = await dependencies.mutate(STORE_KEY, current => {
          const latest = findOwnedProject(current, projectId, identity.userId)
          if (!latest) throw Object.assign(new Error('Developer project not found.'), { status: 404 })
          const next: DeveloperProject = {
            ...latest, name, website, brandImageUrl, useCase, checkoutMode: currentCheckoutMode, capabilities, settlementMode,
            settlementStatus: settlementMode === 'usdc' || bankVerifiedAt ? 'ready' : 'review_required',
            networks, defaultNetwork, recipients: settlementMode === 'usdc' ? recipients : {}, refundAddress, allowedOrigins, webhookUrl,
            bankCode, bankName, bankAccountName: verifiedBankName, bankVerifiedAt: settlementMode === 'ngn' ? bankVerifiedAt : undefined,
            bankAccountLast4: settlementMode === 'ngn' ? (bankAccountNumber.slice(-4) || latest.bankAccountLast4) : '',
            bankAccountCipher: settlementMode === 'ngn' ? (bankAccountNumber ? encryptValue(secret, bankAccountNumber) : latest.bankAccountCipher) : '',
            updatedAt: dependencies.now().toISOString(),
          }
          return { projects: { ...(current?.projects ?? {}), [projectId]: next } }
        })
        return res.json({ ok: true, project: projectPublic(store.projects[projectId]) })
      }

      if (req.method === 'POST' && action === 'create-key') {
        if (currentProject.settlementStatus !== 'ready') {
          return res.status(409).json({ ok: false, error: 'Complete and verify settlement before creating a live key.' })
        }
        if (!currentProject.allowedOrigins.length || (currentProject.settlementMode === 'usdc' && currentProject.networks.some(network => !currentProject.recipients[network]))) {
          return res.status(409).json({ ok: false, error: 'Complete checkout routing before creating a key.' })
        }
        const environment: DeveloperEnvironment = clean(req.body?.environment, 10).toLowerCase() === 'test' ? 'test' : 'live'
        const environmentNetworks: DeveloperNetwork[] = environment === 'test' ? ['arc'] : ['base', 'arbitrum']
        if (currentProject.settlementMode === 'ngn' && environment === 'test') {
          return res.status(409).json({ ok: false, error: 'Naira settlement requires a live key.' })
        }
        if (currentProject.settlementMode === 'usdc' && !currentProject.networks.some(network => environmentNetworks.includes(network))) {
          return res.status(409).json({ ok: false, error: `Configure ${environment === 'test' ? 'Arc Testnet' : 'Base or Arbitrum'} before creating this key.` })
        }
        const rawKey = dependencies.createSecret(environment === 'test' ? 'hpl_test' : 'hpl_live')
        const key: DeveloperKey = {
          id: dependencies.createKeyId(), name: clean(req.body?.name, 60) || 'Backend key',
          prefix: rawKey.slice(0, 18), digest: keyDigest(secret, rawKey), environment, createdAt: dependencies.now().toISOString(),
        }
        let next: DeveloperProject | undefined
        await dependencies.mutate(STORE_KEY, current => {
          const latest = findOwnedProject(current, projectId, identity.userId)
          if (!latest) throw Object.assign(new Error('Developer project not found.'), { status: 404 })
          if (latest.keys.filter(item => !item.revokedAt).length >= 10) throw Object.assign(new Error('Revoke an active API key before creating another.'), { status: 409 })
          next = { ...latest, keys: [...latest.keys, key].slice(-50), updatedAt: dependencies.now().toISOString() }
          return { projects: { ...(current?.projects ?? {}), [projectId]: next } }
        })
        if (!next) throw new Error('API key could not be stored.')
        const publicKeys = projectPublic(next).keys
        return res.status(201).json({ ok: true, apiKey: rawKey, key: publicKeys[publicKeys.length - 1] })
      }

      if (req.method === 'POST' && action === 'revoke-key') {
        const keyId = clean(req.body?.keyId, 80)
        const revokedAt = dependencies.now().toISOString()
        if (!currentProject.keys.some(key => key.id === keyId)) return res.status(404).json({ ok: false, error: 'API key not found.' })
        let next: DeveloperProject | undefined
        await dependencies.mutate(STORE_KEY, current => {
          const latest = findOwnedProject(current, projectId, identity.userId)
          if (!latest) throw Object.assign(new Error('Developer project not found.'), { status: 404 })
          if (!latest.keys.some(key => key.id === keyId)) throw Object.assign(new Error('API key not found.'), { status: 404 })
          next = { ...latest, keys: latest.keys.map(key => key.id === keyId && !key.revokedAt ? { ...key, revokedAt } : key), updatedAt: revokedAt }
          return { projects: { ...(current?.projects ?? {}), [projectId]: next } }
        })
        if (!next) throw new Error('API key could not be revoked.')
        return res.json({ ok: true, project: projectPublic(next) })
      }

      if (req.method === 'POST' && action === 'rotate-webhook-secret') {
        if (!currentProject.webhookUrl) return res.status(409).json({ ok: false, error: 'Save a webhook URL before creating its secret.' })
        const webhookSecret = dependencies.createSecret('whsec')
        let next: DeveloperProject | undefined
        await dependencies.mutate(STORE_KEY, current => {
          const latest = findOwnedProject(current, projectId, identity.userId)
          if (!latest?.webhookUrl) throw Object.assign(new Error('Save a webhook URL before creating its secret.'), { status: 409 })
          next = { ...latest, webhookSecretCipher: encryptValue(secret, webhookSecret), updatedAt: dependencies.now().toISOString() }
          return { projects: { ...(current?.projects ?? {}), [projectId]: next } }
        })
        if (!next) throw new Error('Webhook secret could not be stored.')
        return res.status(201).json({ ok: true, webhookSecret, project: projectPublic(next) })
      }

      return res.status(400).json({ ok: false, error: 'Unknown developer project action.' })
    } catch (error) {
      const status = statusCode(error)
      if (status >= 500) console.error('[developer-projects] request failed:', error instanceof Error ? error.message : String(error))
      return res.status(status).json({ ok: false, error: status >= 500 ? 'Developer projects are temporarily unavailable.' : (error as Error).message })
    }
  }
}

export function developerPolicyFromStore(store: DeveloperStore | undefined, apiKey: string, secret: string): DeveloperCheckoutPolicy | null {
  const requestedEnvironment: DeveloperEnvironment | null = apiKey.startsWith('hpl_live_') ? 'live' : apiKey.startsWith('hpl_test_') ? 'test' : null
  if (!requestedEnvironment || secret.length < 32) return null
  const digest = keyDigest(secret, apiKey)
  for (const project of Object.values(store?.projects ?? {})) {
    const key = project.keys.find(item => !item.revokedAt && safeDigestEqual(item.digest, digest))
    if (!key || project.settlementStatus !== 'ready') continue
    const keyEnvironment: DeveloperEnvironment = key.environment ?? (key.prefix.startsWith('hpl_test_') ? 'test' : 'live')
    if (keyEnvironment !== requestedEnvironment) continue
    const allowedNetworks = keyEnvironment === 'test' ? new Set<DeveloperNetwork>(['arc']) : new Set<DeveloperNetwork>(['base', 'arbitrum'])
    if (project.settlementMode === 'ngn' && keyEnvironment !== 'live') return null
    const paymentOptions = project.settlementMode === 'ngn'
      ? (project.refundAddress ? [{ network: 'base' as const, recipient: project.refundAddress }] : [])
      : project.networks.flatMap(network => allowedNetworks.has(network) && project.recipients[network] ? [{ network, recipient: project.recipients[network]! }] : [])
    if (!paymentOptions.length) return null
    if (project.settlementMode === 'ngn') {
      if (!project.bankAccountCipher || !project.bankCode || !project.bankName || !project.bankAccountName || !project.refundAddress) return null
      return {
        partnerId: project.id,
        merchantName: project.name,
        brandImageUrl: project.brandImageUrl,
        allowedOrigins: project.allowedOrigins,
        defaultNetwork: 'base',
        paymentOptions,
        settlementMode: 'ngn',
        checkoutMode: projectCheckoutMode(project),
        capabilities: project.capabilities?.length ? project.capabilities : ['hosted_checkout'],
        nairaSettlement: {
          bankCode: project.bankCode,
          bankName: project.bankName,
          accountName: project.bankAccountName,
          accountNumber: decryptValue(secret, project.bankAccountCipher),
          refundAddress: project.refundAddress,
        },
        projectManaged: true,
      }
    }
    const defaultNetwork = paymentOptions.some(option => option.network === project.defaultNetwork) ? project.defaultNetwork : paymentOptions[0].network
    return { partnerId: project.id, merchantName: project.name, brandImageUrl: project.brandImageUrl, allowedOrigins: project.allowedOrigins, defaultNetwork, paymentOptions, settlementMode: 'usdc', checkoutMode: projectCheckoutMode(project), capabilities: project.capabilities?.length ? project.capabilities : ['hosted_checkout'], projectManaged: true }
  }
  return null
}

export function developerWebhookSignature(signingSecret: string, timestamp: string, rawBody: string) {
  return createHmac('sha256', signingSecret).update(`${timestamp}.${rawBody}`).digest('hex')
}

export function buildDeveloperWebhookRequest(
  signingSecret: string,
  event: string,
  data: Record<string, unknown>,
  input: { attemptedAt: string; eventId?: string; createdAt?: string },
) {
  const attemptedAtMs = Date.parse(input.attemptedAt)
  if (!Number.isFinite(attemptedAtMs)) throw new Error('Webhook attempt time is invalid.')
  const eventId = input.eventId ?? `evt_${randomUUID().replace(/-/g, '').slice(0, 20)}`
  const payload = JSON.stringify({ id: eventId, event, createdAt: input.createdAt ?? input.attemptedAt, data })
  const timestamp = Math.floor(attemptedAtMs / 1000).toString()
  return { eventId, payload, timestamp, signature: developerWebhookSignature(signingSecret, timestamp, payload) }
}

export async function prepareDeveloperNairaCheckout(policy: DeveloperCheckoutPolicy, checkoutId: string, requestedUsdc: string) {
  const settlement = policy.nairaSettlement
  const amount = Number(requestedUsdc)
  if (policy.settlementMode !== 'ngn' || !settlement) throw new Error('Naira settlement is not configured for this project.')
  if (!Number.isFinite(amount) || amount < 0.5 || amount > 1_000_000) throw new Error('Naira checkouts must be between 0.50 and 1,000,000 USDC.')
  const rate = await getPaycrestOfframpRate({ network: 'base', token: 'USDC', fiat: 'NGN', amount: requestedUsdc })
  const amountNgn = (amount * rate).toFixed(2)
  const order = await createPaycrestOfframpOrder({
    intentId: checkoutId,
    merchantId: policy.partnerId,
    amountNgn,
    estimatedAmountUsdc: requestedUsdc,
    bankCode: settlement.bankCode,
    accountNumber: settlement.accountNumber,
    accountName: settlement.accountName,
    bankName: settlement.bankName,
    refundAddress: settlement.refundAddress,
    payerName: policy.merchantName,
    source: 'hosted-checkout',
    memo: policy.merchantName,
  })
  return {
    provider: 'paycrest' as const,
    orderId: order.paycrest_order_id,
    intentId: order.intent_id,
    requestedUsdc,
    payableUsdc: order.amount_usdc,
    amountNgn: order.amount_ngn,
    receiveAddress: order.receive_address,
    bankName: order.bank_name ?? settlement.bankName,
    bankLast4: order.bank_last4 ?? settlement.accountNumber.slice(-4),
    accountName: order.bank_account_name ?? settlement.accountName,
    validUntil: order.valid_until,
    status: order.status,
  }
}

export async function dispatchDeveloperWebhook(partnerId: string, event: string, data: Record<string, unknown>, delivery?: { eventId: string; createdAt: string }) {
  if (!partnerId.startsWith('dev_') || !defaults.hasStore()) return
  const secret = defaults.portalSecret()
  if (secret.length < 32) return
  const store = await defaults.read(STORE_KEY)
  const project = store?.projects?.[partnerId]
  if (!project?.webhookUrl || !project.webhookSecretCipher) return
  const signingSecret = decryptValue(secret, project.webhookSecretCipher)
  const attemptedAt = defaults.now().toISOString()
  const { eventId, payload, timestamp, signature } = buildDeveloperWebhookRequest(signingSecret, event, data, {
    attemptedAt,
    eventId: delivery?.eventId,
    createdAt: delivery?.createdAt,
  })
  let responseStatus: number | undefined
  let failure = ''
  try {
    responseStatus = await postPublicWebhook(project.webhookUrl, payload, { 'content-type': 'application/json', 'user-agent': 'HashPayLink-Webhooks/1.0', 'x-hashpaylink-event': eventId, 'x-hashpaylink-signature': `t=${timestamp},v1=${signature}` })
    if (responseStatus < 200 || responseStatus >= 300) failure = `Webhook returned HTTP ${responseStatus}.`
  } catch (error) {
    failure = error instanceof Error ? error.message.slice(0, 180) : 'Webhook delivery failed.'
  }
  await defaults.mutate(STORE_KEY, current => {
    const latest = current?.projects?.[partnerId]
    if (!latest) return current ?? { projects: {} }
    const delivery = { id: eventId, event, status: failure ? 'failed' as const : 'delivered' as const, ...(responseStatus ? { responseStatus } : {}), attemptedAt, ...(failure ? { error: failure } : {}) }
    return { projects: { ...(current?.projects ?? {}), [partnerId]: { ...latest, webhookDeliveries: [...(latest.webhookDeliveries ?? []).filter(item => item.id !== eventId), delivery].slice(-100) } } }
  })
  if (failure) throw new Error(failure)
}

export async function resolveDeveloperApiKeyPolicy(req: Pick<Request, 'headers'>): Promise<DeveloperCheckoutPolicy | null> {
  const secret = defaults.portalSecret()
  if (!defaults.hasStore() || secret.length < 32) return null
  const bearer = String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  const apiKey = clean(req.headers['x-api-key'], 240) || bearer || ''
  return developerPolicyFromStore(await defaults.read(STORE_KEY), apiKey, secret)
}

export default createDeveloperProjectsHandler()
