import { constants, createHmac, randomBytes, randomUUID, publicEncrypt, createCipheriv } from 'node:crypto'
import { createDeveloperProjectsHandler, validatePublicWebhookDestination } from '../api/developer-projects.ts'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from '../api/render-durable-store.ts'

const storeKey = String(process.env.DEVELOPER_PROJECT_STORE_KEY ?? 'hashpaylink:developer-projects:v1').trim()
const portalSecret = String(process.env.DEVELOPER_PORTAL_SECRET ?? '').trim()
const sourceDigest = String(process.env.HASHPAYSTREAM_SOURCE_KEY_DIGEST ?? '').trim().toLowerCase()
const arcRecipient = String(process.env.HASHPAYSTREAM_UPFRONT_ARC_RECIPIENT ?? '').trim()
const sealKey = String(process.env.HASHPAYSTREAM_UPFRONT_SEAL_PUBLIC_KEY ?? '').trim()
const projectName = 'HashPayStream Upfront'
const website = 'https://hashpaystream.onrender.com/'
const webhookUrl = 'https://hashpaystream.onrender.com/api/hashpaystream/v1/upfront/arc-agreement-webhook'

function requireConfiguration() {
  if (!hasRenderDurableStore()) throw new Error('Render durable store is unavailable.')
  if (portalSecret.length < 32) throw new Error('Developer portal security is unavailable.')
  if (!/^[0-9a-f]{64}$/.test(sourceDigest)) throw new Error('A source API-key digest is required.')
  if (!/^0x[0-9a-f]{40}$/i.test(arcRecipient)) throw new Error('A valid Arc recipient is required.')
  if (!/^[A-Za-z0-9+/=]{300,800}$/.test(sealKey)) throw new Error('A valid sealing public key is required.')
}

function responseRecorder() {
  return {
    statusCode: 200, body: undefined, headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function invoke(handler, method, body) {
  const response = responseRecorder()
  await handler({ method, body, query: {}, headers: {} }, response)
  if (response.statusCode < 200 || response.statusCode >= 300 || !response.body?.ok) {
    throw new Error(`Developer project operation failed (${response.statusCode}): ${response.body?.error ?? 'unknown error'}`)
  }
  return response.body
}

function seal(value) {
  const contentKey = randomBytes(32)
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', contentKey, nonce)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const wrappedKey = publicEncrypt({
    key: Buffer.from(sealKey, 'base64'),
    format: 'der',
    type: 'spki',
    oaepHash: 'sha256',
    padding: constants.RSA_PKCS1_OAEP_PADDING,
  }, contentKey)
  contentKey.fill(0)
  return {
    algorithm: 'RSA-OAEP-256+A256GCM',
    wrappedKey: wrappedKey.toString('base64'),
    nonce: nonce.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

requireConfiguration()
const initialStore = await readDurableJson(storeKey)
const projects = Object.values(initialStore?.projects ?? {})
const sources = projects.filter(project => (project.keys ?? []).some(key => !key.revokedAt && key.digest === sourceDigest))
if (sources.length !== 1) throw new Error(`Expected exactly one source HashPayStream project; found ${sources.length}.`)
const source = sources[0]
if ((source.checkoutMode ?? 'human') !== 'human' || !(source.capabilities ?? []).includes('arc_agreements')) {
  throw new Error('The source project is not the expected human Arc Agreements project.')
}
if (projects.some(project => project.ownerId === source.ownerId && project.name === projectName)) {
  throw new Error('HashPayStream Upfront already exists; refusing to create a duplicate or rotate recoverable credentials.')
}
if (String(process.env.HASHPAYSTREAM_UPFRONT_DRY_RUN ?? '').toLowerCase() === 'true') {
  await validatePublicWebhookDestination(webhookUrl)
  console.log(JSON.stringify({
    ok: true,
    dryRun: true,
    sourceMatched: true,
    duplicateProject: false,
    checkoutMode: 'human',
    network: 'arc',
    webhookDestinationValid: true,
  }))
  process.exit(0)
}

const dependencies = {
  hasStore: hasRenderDurableStore,
  read: key => readDurableJson(key),
  mutate: (key, update) => mutateDurableJson(key, update),
  verify: async () => ({ userId: source.ownerId, email: source.ownerEmail ?? '' }),
  validateWebhook: validatePublicWebhookDestination,
  paycrestReady: () => false,
  listBanks: async () => [],
  verifyBank: async () => { throw new Error('Naira settlement is not permitted by this provisioner.') },
  portalSecret: () => portalSecret,
  adminEmails: () => source.ownerEmail ?? '',
  adminUserIds: () => source.ownerId,
  createProjectId: () => `dev_${randomUUID().replace(/-/g, '').slice(0, 18)}`,
  createKeyId: () => `key_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
  createSecret: prefix => `${prefix}_${randomBytes(24).toString('base64url')}`,
  now: () => new Date(),
}
const handler = createDeveloperProjectsHandler(dependencies)

const created = await invoke(handler, 'POST', {
  action: 'create',
  name: projectName,
  website,
  useCase: 'Create isolated Arc milestone agreements whose verified receivables can be assessed for PolyDesk Upfront liquidity.',
  checkoutMode: 'human',
  capabilities: ['arc_agreements'],
})
const projectId = created.project.id

await invoke(handler, 'PUT', {
  action: 'configure', projectId,
  name: projectName,
  website,
  useCase: 'Create isolated Arc milestone agreements whose verified receivables can be assessed for PolyDesk Upfront liquidity.',
  checkoutMode: 'human',
  capabilities: ['arc_agreements'],
  settlementMode: 'usdc',
  networks: ['arc'],
  defaultNetwork: 'arc',
  recipients: { arc: arcRecipient },
  allowedOrigins: [new URL(website).origin],
  webhookUrl,
})
const webhook = await invoke(handler, 'POST', { action: 'rotate-webhook-secret', projectId })
const key = await invoke(handler, 'POST', {
  action: 'create-key', projectId, name: 'HashPayStream Upfront production pilot', environment: 'test',
})
const approved = await invoke(handler, 'POST', {
  action: 'admin-arc-pilot-approve', projectId,
  maxAgreementUsdc: '1', dailyVolumeUsdc: '1', maxActiveAgreements: 1, maxDurationSeconds: 604800,
})

const digest = createHmac('sha256', portalSecret).update(key.apiKey).digest('hex')
const finalStore = await readDurableJson(storeKey)
const stored = finalStore?.projects?.[projectId]
if (!stored || stored.arcAgreementPilot?.status !== 'approved' || !stored.keys?.some(item => item.digest === digest && !item.revokedAt)) {
  throw new Error('Provisioned project could not be verified from durable storage.')
}

console.log(JSON.stringify({
  ok: true,
  projectId,
  checkoutMode: stored.checkoutMode,
  networks: stored.networks,
  defaultNetwork: stored.defaultNetwork,
  settlementStatus: stored.settlementStatus,
  operationalStatus: stored.operationalStatus,
  arcPilotStatus: approved.project.arcAgreementPilot?.status,
  webhookConfigured: Boolean(stored.webhookSecretCipher),
  testKeyConfigured: true,
  sealed: seal({ apiKey: key.apiKey, webhookSecret: webhook.webhookSecret }),
}))
