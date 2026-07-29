import {
  createCipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import {
  createPublicClient,
  getAddress,
  http,
} from 'viem'
import { arcAgreementClientReference } from '../api/arc-agreement-terms.ts'
import { prepareArcAgreementDeployment } from '../api/arc-agreement-reconciliation.ts'
import { readConfirmedArcAgreementSnapshot } from '../api/arc-agreement-confirmed-snapshot.ts'
import {
  mutateDurableJson,
  readDurableJson,
} from '../api/render-durable-store.ts'
import { developerWebhookSignature } from '../api/developer-projects.ts'

const CONFIRM_FLAG = '--confirm-durable-signed-webhook-test'
const MODE = process.argv.find(value => value === 'prepare' || value === 'resume') ?? ''
const FACTORY = getAddress('0xe828795f52b3d6902b982ab7266aaae404d7cea5')
const OPERATOR = getAddress('0xd55d6ba98eABeCeCD24C84e715b13157ee4fCb49')
const USDC = getAddress('0x3600000000000000000000000000000000000000')
const ESCROW = getAddress('0xDB25e5f76563d8211A1648A30092A0E7E7668a9F')
const PARTNER_ID = 'dev_arce2e20260729'
const AGREEMENT_ID = 'agr_arce2e20260729controlled'
const DEVELOPER_STORE_KEY = (process.env.DEVELOPER_PROJECT_STORE_KEY ?? 'hashpaylink:developer-projects:v1').trim()
const OUTBOX_STORE_KEY = 'hashpaylink:arc-agreement-webhooks:durable-e2e:v1'
const AUDIT_STORE_KEY = 'hashpaylink:arc-agreement-webhook-audit:v1'
const TEST_OWNER = 'system:arc-agreement-webhook-audit'
const WEBHOOK_SITE_API = 'https://webhook.site'

// Set this before importing the outbox module so the test proves persistence
// without letting the production worker race the two controlled phases.
process.env.ARC_AGREEMENT_WEBHOOK_STORE_KEY = OUTBOX_STORE_KEY
const {
  drainArcAgreementWebhookOutbox,
  reconcileAndQueueArcAgreementWebhook,
} = await import('../api/arc-agreement-webhooks.ts')

function progress(stage, detail = '') {
  console.log(`[arc-webhook-e2e] ${stage}${detail ? ` — ${detail}` : ''}`)
}

function required(name) {
  const value = String(process.env[name] ?? '').trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function assertSafetyBoundary() {
  if (!process.argv.includes(CONFIRM_FLAG)) throw new Error(`Refusing to execute without ${CONFIRM_FLAG}.`)
  if (!MODE) throw new Error('Choose prepare or resume.')
  if (String(process.env.ARC_AGREEMENT_DURABLE_WEBHOOK_TEST_ENABLED).toLowerCase() !== 'true') {
    throw new Error('ARC_AGREEMENT_DURABLE_WEBHOOK_TEST_ENABLED=true is required.')
  }
  if (String(process.env.ARC_AGREEMENTS_ENABLED).toLowerCase() === 'true') {
    throw new Error('Public Arc Agreements activation must remain disabled during this test.')
  }
  if (getAddress(required('ARC_AGREEMENT_FACTORY_ADDRESS')) !== FACTORY) {
    throw new Error('ARC_AGREEMENT_FACTORY_ADDRESS does not match the reviewed factory.')
  }
  const databaseUrl = required('DATABASE_URL')
  if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) throw new Error('A durable PostgreSQL DATABASE_URL is required.')
  const portalSecret = required('DEVELOPER_PORTAL_SECRET')
  if (portalSecret.length < 32) throw new Error('DEVELOPER_PORTAL_SECRET must contain at least 32 characters.')
  return {
    portalSecret,
    rpcUrl: String(process.env.PRIVATE_RPC_URL_ARC ?? 'https://rpc.testnet.arc.network').trim(),
  }
}

function encryptValue(secret, value) {
  const key = createHash('sha256').update(`developer-portal:${secret}`).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map(item => item.toString('base64url')).join('.')
}

function signingSecret(portalSecret) {
  return createHmac('sha256', portalSecret)
    .update('hashpaylink:arc-agreement:durable-webhook-test:v1')
    .digest('hex')
}

async function webhookSite(path, init = {}) {
  const response = await fetch(`${WEBHOOK_SITE_API}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 240)
    throw new Error(`Webhook.site ${path} failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}.`)
  }
  if (response.status === 204) return null
  return response.json()
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left))
  const b = Buffer.from(String(right))
  return a.length === b.length && timingSafeEqual(a, b)
}

function header(request, name) {
  const value = request?.headers?.[name.toLowerCase()]
  return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')
}

function verifyCapturedRequest(request, expectedSecret, eventId) {
  const signatureHeader = header(request, 'x-hashpaylink-signature')
  const capturedEventId = header(request, 'x-hashpaylink-event')
  const timestamp = signatureHeader.match(/(?:^|,)t=(\d+)/)?.[1] ?? ''
  const signature = signatureHeader.match(/(?:^|,)v1=([0-9a-f]{64})/i)?.[1] ?? ''
  const content = String(request?.content ?? '')
  const payload = JSON.parse(content)
  const expected = developerWebhookSignature(expectedSecret, timestamp, content)
  if (!safeEqual(capturedEventId, eventId)) throw new Error('Captured webhook event id does not match the durable event.')
  if (!timestamp || !signature || !safeEqual(signature, expected)) throw new Error('Captured webhook signature verification failed.')
  if (payload.id !== eventId || payload.event !== 'agreement.cancelled') {
    throw new Error('Captured webhook payload does not match the cancelled agreement event.')
  }
  return {
    requestId: String(request.uuid ?? ''),
    timestamp,
    signature,
    payloadHash: createHash('sha256').update(content).digest('hex'),
    content,
  }
}

async function preparedAgreement(rpcUrl) {
  const client = createPublicClient({
    chain: {
      id: 5_042_002,
      name: 'Arc Testnet',
      nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    },
    transport: http(rpcUrl, { timeout: 30_000, retryCount: 2 }),
  })
  if (await client.getChainId() !== 5_042_002) throw new Error('RPC is not Arc Testnet.')
  const confirmed = await readConfirmedArcAgreementSnapshot(client, ESCROW, 5)
  if (confirmed.snapshot.status !== 3) throw new Error('Controlled agreement must remain cancelled.')
  const activationTimestamp = Number(confirmed.snapshot.cancelUntil) - 3_600
  const prepared = prepareArcAgreementDeployment({
    draft: {
      clientReference: arcAgreementClientReference(PARTNER_ID, AGREEMENT_ID),
      termsHash: confirmed.snapshot.termsHash,
      chainTerms: {
        templateCode: confirmed.snapshot.templateCode,
        amountUsdcUnits: confirmed.snapshot.totalAmount.toString(),
        recipient: confirmed.snapshot.recipient,
        cumulativeReleaseBps: [...confirmed.snapshot.cumulativeReleaseBps],
        durationSeconds: Number(confirmed.snapshot.expiresAt) - activationTimestamp,
        cancellationWindowSeconds: 3_600,
      },
    },
    payer: confirmed.snapshot.payer,
    factory: FACTORY,
    operator: OPERATOR,
    usdc: USDC,
    activationTimestamp,
  })
  return { client, confirmed, prepared }
}

async function provisionTestProject(portalSecret, tokenId) {
  const secret = signingSecret(portalSecret)
  await mutateDurableJson(DEVELOPER_STORE_KEY, current => {
    const store = current ?? { projects: {} }
    const existing = store.projects?.[PARTNER_ID]
    if (existing && existing.ownerId !== TEST_OWNER) {
      throw new Error(`Refusing to overwrite existing developer project ${PARTNER_ID}.`)
    }
    const now = new Date().toISOString()
    return {
      projects: {
        ...(store.projects ?? {}),
        [PARTNER_ID]: {
          id: PARTNER_ID,
          ownerId: TEST_OWNER,
          ownerEmail: '',
          name: 'Arc Agreement Durable Webhook Audit',
          website: 'https://hashpaylink.com',
          useCase: 'Controlled signed webhook persistence test',
          checkoutMode: 'human',
          capabilities: ['arc_agreements'],
          settlementMode: 'usdc',
          settlementStatus: 'review_required',
          operationalStatus: 'suspended',
          networks: ['arc'],
          defaultNetwork: 'arc',
          recipients: {},
          refundAddress: '',
          allowedOrigins: ['https://hashpaylink.com'],
          webhookUrl: `${WEBHOOK_SITE_API}/${tokenId}`,
          webhookSecretCipher: encryptValue(portalSecret, secret),
          bankCode: '',
          bankName: '',
          bankAccountName: '',
          bankAccountLast4: '',
          bankAccountCipher: '',
          keys: [],
          operations: [],
          webhookDeliveries: existing?.webhookDeliveries ?? [],
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        },
      },
    }
  })
  return secret
}

async function removeTestProject() {
  await mutateDurableJson(DEVELOPER_STORE_KEY, current => {
    const store = current ?? { projects: {} }
    const existing = store.projects?.[PARTNER_ID]
    if (!existing || existing.ownerId !== TEST_OWNER) return store
    const projects = { ...store.projects }
    delete projects[PARTNER_ID]
    return { projects }
  })
}

async function capturedRequests(tokenId) {
  const response = await webhookSite(`/token/${tokenId}/requests?sorting=oldest&per_page=10`)
  return Array.isArray(response?.data) ? response.data.filter(item => item?.method === 'POST') : []
}

async function prepare(config) {
  progress('Preparing isolated external receiver', 'first response forced to HTTP 500')
  let audit = await readDurableJson(AUDIT_STORE_KEY)
  if (audit?.verified) {
    console.log(JSON.stringify({ ok: true, alreadyVerified: true, ...audit }, null, 2))
    return
  }
  let tokenId = String(audit?.tokenId ?? '')
  if (!tokenId) {
    const token = await webhookSite('/token', {
      method: 'POST',
      body: JSON.stringify({
        default_status: 500,
        default_content: 'controlled retry',
        default_content_type: 'text/plain',
        expiry: 3_600,
        request_limit: 10,
      }),
    })
    tokenId = String(token?.uuid ?? '')
    if (!/^[0-9a-f-]{36}$/i.test(tokenId)) throw new Error('Webhook.site returned an invalid token id.')
    audit = {
      schema: 1,
      phase: 'receiver_created',
      tokenId,
      partnerId: PARTNER_ID,
      agreementId: AGREEMENT_ID,
      createdAt: new Date().toISOString(),
      verified: false,
    }
    await mutateDurableJson(AUDIT_STORE_KEY, () => audit)
  } else {
    await webhookSite(`/token/${tokenId}`, {
      method: 'PUT',
      body: JSON.stringify({ default_status: 500, expiry: 3_600, request_limit: 10 }),
    })
  }

  const expectedSecret = await provisionTestProject(config.portalSecret, tokenId)
  progress('Reading confirmed cancelled agreement')
  const { client, prepared } = await preparedAgreement(config.rpcUrl)
  const queued = await reconcileAndQueueArcAgreementWebhook({
    client,
    partnerId: PARTNER_ID,
    agreementId: AGREEMENT_ID,
    prepared,
    escrow: ESCROW,
    confirmationBlocks: 5,
  })
  const outboxBefore = await readDurableJson(OUTBOX_STORE_KEY)
  const beforeEvent = outboxBefore?.events?.[queued.event.id]
  if (!beforeEvent) throw new Error('Durable event was not persisted.')
  if (beforeEvent.status === 'delivered') throw new Error('Durable test event was already delivered unexpectedly.')
  if (beforeEvent.attempts === 0) {
    progress('Forcing first delivery failure')
    if (await drainArcAgreementWebhookOutbox(undefined, 1) !== 0) {
      throw new Error('HTTP 500 delivery must not be reported as delivered.')
    }
  }
  const outboxAfter = await readDurableJson(OUTBOX_STORE_KEY)
  const failedEvent = outboxAfter?.events?.[queued.event.id]
  if (failedEvent?.status !== 'pending' || failedEvent.attempts < 1 || !/HTTP 500/.test(failedEvent.lastError ?? '')) {
    throw new Error('Failed delivery was not persisted for retry.')
  }
  await new Promise(resolve => setTimeout(resolve, 1_000))
  const requests = await capturedRequests(tokenId)
  if (!requests.length) throw new Error('External receiver did not capture the failed signed request.')
  const verifiedRequest = verifyCapturedRequest(requests[0], expectedSecret, queued.event.id)
  const next = {
    ...audit,
    phase: 'failed_once',
    eventId: queued.event.id,
    firstRequestId: verifiedRequest.requestId,
    payloadHash: verifiedRequest.payloadHash,
    attemptsAfterFailure: failedEvent.attempts,
    nextAttemptAt: failedEvent.nextAttemptAt,
    failedAt: new Date().toISOString(),
  }
  await mutateDurableJson(AUDIT_STORE_KEY, () => next)
  progress('First signed delivery failed and remained durable')
  console.log(JSON.stringify({
    ok: true,
    phase: next.phase,
    eventId: next.eventId,
    attempts: next.attemptsAfterFailure,
    nextAttemptAt: next.nextAttemptAt,
    processRestartRequired: true,
  }, null, 2))
}

async function resume(config) {
  const audit = await readDurableJson(AUDIT_STORE_KEY)
  if (audit?.verified) {
    console.log(JSON.stringify({ ok: true, alreadyVerified: true, ...audit }, null, 2))
    return
  }
  if (audit?.phase !== 'failed_once' || !audit.tokenId || !audit.eventId) {
    throw new Error('Run the prepare phase successfully before resume.')
  }
  const expectedSecret = await provisionTestProject(config.portalSecret, audit.tokenId)
  progress('Recovered durable event in a new process')
  const outboxBefore = await readDurableJson(OUTBOX_STORE_KEY)
  const recovered = outboxBefore?.events?.[audit.eventId]
  if (recovered?.status !== 'pending' || recovered.attempts < 1) {
    throw new Error('Pending durable event was not recovered after process restart.')
  }

  await webhookSite(`/token/${audit.tokenId}`, {
    method: 'PUT',
    body: JSON.stringify({
      default_status: 200,
      default_content: 'accepted',
      default_content_type: 'text/plain',
      expiry: 3_600,
      request_limit: 10,
    }),
  })
  const dueIn = Math.max(0, Date.parse(recovered.nextAttemptAt) - Date.now())
  if (dueIn > 0) {
    progress('Waiting for persisted retry deadline', `${Math.ceil(dueIn / 1000)} seconds`)
    await new Promise(resolve => setTimeout(resolve, dueIn + 250))
  }
  progress('Delivering recovered event')
  if (await drainArcAgreementWebhookOutbox(undefined, 1) !== 1) {
    throw new Error('Recovered webhook was not delivered.')
  }
  const outboxAfter = await readDurableJson(OUTBOX_STORE_KEY)
  const delivered = outboxAfter?.events?.[audit.eventId]
  if (delivered?.status !== 'delivered' || delivered.attempts < 2) {
    throw new Error('Successful retry was not persisted as delivered.')
  }

  await new Promise(resolve => setTimeout(resolve, 1_000))
  const requests = await capturedRequests(audit.tokenId)
  const relevant = requests.filter(request => header(request, 'x-hashpaylink-event') === audit.eventId)
  if (relevant.length < 2) throw new Error('External receiver did not capture both delivery attempts.')
  const verified = relevant.map(request => verifyCapturedRequest(request, expectedSecret, audit.eventId))
  if (!verified.every(item => item.payloadHash === audit.payloadHash)) {
    throw new Error('Webhook retry changed the durable payload.')
  }
  if (new Set(verified.map(item => item.requestId)).size !== verified.length) {
    throw new Error('External receiver request ids are not unique.')
  }

  const { client, prepared } = await preparedAgreement(config.rpcUrl)
  const replay = await reconcileAndQueueArcAgreementWebhook({
    client,
    partnerId: PARTNER_ID,
    agreementId: AGREEMENT_ID,
    prepared,
    escrow: ESCROW,
    confirmationBlocks: 5,
  })
  if (!replay.replayed || replay.event.id !== audit.eventId) {
    throw new Error('Stable event replay detection failed.')
  }
  if (await drainArcAgreementWebhookOutbox(undefined, 1) !== 0) {
    throw new Error('Delivered replay must not create another delivery.')
  }
  const requestCountAfterReplay = (await capturedRequests(audit.tokenId))
    .filter(request => header(request, 'x-hashpaylink-event') === audit.eventId)
    .length
  if (requestCountAfterReplay !== relevant.length) {
    throw new Error('Duplicate suppression failed after delivered replay.')
  }

  await removeTestProject()
  let receiverDeleted = true
  try {
    await webhookSite(`/token/${audit.tokenId}`, { method: 'DELETE' })
  } catch {
    // This disposable endpoint expires after one hour and contains only the
    // controlled test payload. Internal project cleanup remains mandatory.
    receiverDeleted = false
  }

  const evidence = {
    schema: 1,
    verified: true,
    phase: 'verified',
    partnerId: PARTNER_ID,
    agreementId: AGREEMENT_ID,
    escrow: ESCROW,
    eventId: audit.eventId,
    event: 'agreement.cancelled',
    attempts: delivered.attempts,
    firstResponseStatus: 500,
    finalResponseStatus: 200,
    processRestartPersistence: true,
    signaturesVerified: verified.length,
    stablePayloadHash: audit.payloadHash,
    duplicateSuppression: true,
    testProjectRemoved: true,
    disposableReceiverDeleted: receiverDeleted,
    deliveredAt: delivered.deliveredAt,
    verifiedAt: new Date().toISOString(),
    publicActivationEnabled: false,
  }
  await mutateDurableJson(AUDIT_STORE_KEY, () => evidence)
  progress('Durable signed-webhook gate passed')
  console.log(JSON.stringify({ ok: true, ...evidence }, null, 2))
}

async function main() {
  const config = assertSafetyBoundary()
  progress('Safety preflight passed', 'public activation disabled')
  if (MODE === 'prepare') await prepare(config)
  else await resume(config)
}

main().catch(error => {
  console.error(`Arc durable webhook test failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
