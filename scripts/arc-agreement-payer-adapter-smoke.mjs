import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getAddress } from 'viem'
import {
  arcAgreementPayerIdentityHash,
} from '../api/arc-agreement-activation-attempts.ts'
import { createArcAgreementPayerHandler } from '../api/arc-agreement-payer.ts'

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function request(handler, body, headers = {}) {
  const response = responseRecorder()
  await handler({ method: 'POST', body, headers }, response)
  return response
}

const partnerId = 'dev_payerroute1234'
const agreementId = 'agr_payerroute123456'
const payer = getAddress('0x3333333333333333333333333333333333333333')
const recipient = getAddress('0x2222222222222222222222222222222222222222')
const identity = { userId: 'did:privy:test-user-1234', email: 'payer@example.com' }
const capability = `agrp_${'a'.repeat(43)}`
const agreement = {
  id: agreementId,
  partnerId,
  checkoutMode: 'human',
  environment: 'test',
  network: 'arc',
  template: 'fixed_unlock',
  externalId: 'order-1',
  resourceId: 'content:1',
  title: 'Payer route test',
  description: 'Verify the authenticated Arc payer route.',
  amount: '10',
  recipient,
  durationSeconds: 86_400,
  cancellationWindowSeconds: 900,
  termsHash: `0x${'1'.repeat(64)}`,
  clientReference: `0x${'2'.repeat(64)}`,
  chainTerms: {
    templateCode: 0,
    amountUsdcUnits: '10000000',
    recipient,
    cumulativeReleaseBps: [10_000],
    durationSeconds: 86_400,
    cancellationWindowSeconds: 900,
  },
  status: 'draft',
  activationStatus: 'private_pilot',
  requestHash: 'request-secret',
  payerAccessHash: 'access-secret',
  createdAt: '2026-07-29T14:00:00.000Z',
  updatedAt: '2026-07-29T14:00:00.000Z',
}
const policy = {
  partnerId,
  merchantName: 'Payer Route',
  allowedOrigins: ['https://payer.example'],
  defaultNetwork: 'arc',
  paymentOptions: [{ network: 'arc', recipient }],
  settlementMode: 'usdc',
  environment: 'test',
  checkoutMode: 'human',
  capabilities: ['arc_agreements'],
  webhookConfigured: true,
  projectManaged: true,
}
const link = {
  privyUserId: identity.userId,
  email: identity.email,
  chain: 'arc',
  purpose: 'payment',
  circleWalletId: 'wallet-test-1234',
  circleWalletAddress: payer,
  circleBlockchain: 'ARC-TESTNET',
  updatedAt: Date.now(),
}
const attempt = {
  id: 'aat_payerroute123456789012',
  partnerId,
  agreementId,
  payerIdentityHash: arcAgreementPayerIdentityHash(`privy:${identity.userId}`),
  checkoutMode: 'human',
  status: 'awaiting_approval',
  authorization: {
    authorized: true,
    partnerId,
    checkoutMode: 'human',
    amountCeilingUsdcUnits: '25000000',
    durationCeilingSeconds: 2_592_000,
    factory: getAddress('0xe828795f52b3d6902b982ab7266aaae404d7cea5'),
    operator: getAddress('0xd55d6ba98eABeCeCD24C84e715b13157ee4fCb49'),
    confirmationBlocks: 5,
  },
  prepared: {
    chainId: 5_042_002,
    agreementId: `0x${'3'.repeat(64)}`,
    deploymentHash: `0x${'4'.repeat(64)}`,
    clientReference: agreement.clientReference,
    termsHash: agreement.termsHash,
    factory: getAddress('0xe828795f52b3d6902b982ab7266aaae404d7cea5'),
    payer,
    recipient,
    operator: getAddress('0xd55d6ba98eABeCeCD24C84e715b13157ee4fCb49'),
    usdc: getAddress('0x3600000000000000000000000000000000000000'),
    templateCode: 0,
    totalAmount: '10000000',
    cancelUntil: '1785334500',
    expiresAt: '1785420000',
    cumulativeReleaseBps: [10_000],
  },
  calls: {
    approval: { chainId: 5_042_002, to: getAddress('0x3600000000000000000000000000000000000000'), data: '0x1234', value: '0' },
    activation: { chainId: 5_042_002, to: getAddress('0xe828795f52b3d6902b982ab7266aaae404d7cea5'), data: '0x5678', value: '0' },
  },
  transactions: [],
  activationTimestamp: 1_785_333_600,
  createdAt: '2026-07-29T14:00:00.000Z',
  updatedAt: '2026-07-29T14:00:00.000Z',
}

let currentAgreement = agreement
let currentIdentity = identity
let currentLink = link
let currentPolicy = policy
let currentAttempt = null
let walletVerifications = 0
let challengeInput
let currentJournal
let lifecycleJournal
let lifecycleReconcileCalls = 0
let refundEligible = false
let recordedTransactionInput
let reconciliationResult
let operatorAction
const challengeOrder = []
const providerTransactionId = '123e4567-e89b-42d3-a456-426614174002'
const dependencies = {
  verifyUser: async () => currentIdentity,
  readAgreement: async (_id, token) => token === capability ? currentAgreement : null,
  resolvePolicy: async () => currentPolicy,
  readLink: async () => currentLink,
  verifyWallet: async input => {
    walletVerifications += 1
    assert.equal(input.wallet.address, payer)
    assert.equal(input.userToken, 'circle-user-token')
  },
  prepareAttempt: async input => {
    assert.equal(input.payer, payer)
    assert.equal(input.payerIdentity, `privy:${identity.userId}`)
    currentAttempt = attempt
    return { attempt, replayed: false }
  },
  readAttempt: async () => {
    if (!currentAttempt) throw new Error('Arc Agreement activation attempt was not found for this project.')
    return currentAttempt
  },
  readAttemptRecord: async () => {
    if (!currentAttempt) throw new Error('Arc Agreement activation attempt was not found for this project.')
    return currentAttempt
  },
  prepareChallenge: async input => {
    challengeOrder.push('prepare')
    return {
      attempt: currentAttempt,
      call: { chainId: 5_042_002, to: payer, data: '0xabcdef', value: '0' },
      priorStageTransactions: 0,
      stage: input.stage,
    }
  },
  reserveChallenge: async input => {
    challengeOrder.push('reserve')
    if (!currentJournal) {
      currentJournal = {
        idempotencyKey: '123e4567-e89b-42d3-a456-426614174001',
        stage: input.stage,
        sequence: 0,
        status: 'reserved',
        walletId: input.walletId,
        walletAddress: input.walletAddress,
        createdAt: agreement.createdAt,
        updatedAt: agreement.updatedAt,
      }
    }
    currentAttempt = { ...currentAttempt, challenges: [currentJournal] }
    return { attempt: currentAttempt, challenge: currentJournal, replayed: Boolean(currentJournal.challengeId) }
  },
  attachChallenge: async input => {
    currentJournal = {
      ...currentJournal,
      status: 'issued',
      challengeId: input.challengeId,
    }
    currentAttempt = { ...currentAttempt, challenges: [currentJournal] }
    return { attempt: currentAttempt, challenge: currentJournal }
  },
  observeChallenge: async input => {
    currentJournal = {
      ...currentJournal,
      status: input.status,
      providerTransactionId: input.providerTransactionId ?? currentJournal.providerTransactionId,
      transactionHash: input.transactionHash ?? currentJournal.transactionHash,
      providerState: input.providerState,
    }
    currentAttempt = { ...currentAttempt, challenges: [currentJournal] }
    return currentJournal
  },
  markChallengeRecorded: async input => {
    currentJournal = {
      ...currentJournal,
      status: 'recorded',
      transactionHash: input.transactionHash,
    }
    currentAttempt = { ...currentAttempt, challenges: [currentJournal] }
    return currentJournal
  },
  recordTransaction: async input => {
    assert.equal(input.transactionHash, `0x${'9'.repeat(64)}`)
    recordedTransactionInput = input
    currentAttempt = {
      ...currentAttempt,
      status: input.stage === 'approval' ? 'approval_submitted' : 'activation_submitted',
    }
    return { attempt: currentAttempt, replayed: false }
  },
  reconcileAttempt: async () => reconciliationResult ?? ({
    attempt: { ...currentAttempt, status: 'approval_submitted' },
    pending: true,
    changed: false,
  }),
  createChallenge: async input => {
    challengeInput = input
    return { challengeId: 'challenge-test-1234' }
  },
  readChallenge: async () => ({
    state: 'COMPLETE',
    correlationIds: [providerTransactionId],
  }),
  readTransaction: async input => {
    assert.equal(input.transactionId, providerTransactionId)
    return { state: 'COMPLETE', txHash: `0x${'9'.repeat(64)}` }
  },
  reviewLifecycle: async () => ({
    eligibility: {
      cancel: { eligible: !refundEligible, reason: refundEligible ? 'expired' : null },
      refund: { eligible: refundEligible, reason: refundEligible ? null : 'not_expired' },
    },
    action: lifecycleJournal ?? null,
  }),
  reserveLifecycle: async input => {
    assert.equal(input.action, 'cancel')
    assert.equal(input.payerIdentity, `privy:${identity.userId}`)
    lifecycleJournal ??= {
      id: 'pal_payerroute123456789012',
      partnerId,
      agreementId,
      action: 'cancel',
      sequence: 0,
      status: 'reserved',
      idempotencyKey: '123e4567-e89b-42d3-a456-426614174011',
      createdAt: agreement.createdAt,
      updatedAt: agreement.updatedAt,
    }
    return {
      action: lifecycleJournal,
      call: { chainId: 5_042_002, to: payer, data: '0xcafebabe', value: '0' },
      replayed: Boolean(lifecycleJournal.challengeId),
    }
  },
  readLifecycle: async () => lifecycleJournal,
  attachLifecycle: async input => {
    lifecycleJournal = {
      ...lifecycleJournal,
      challengeId: input.challengeId,
      status: 'issued',
    }
    return lifecycleJournal
  },
  observeLifecycle: async input => {
    lifecycleJournal = {
      ...lifecycleJournal,
      status: input.status,
      providerTransactionId: input.providerTransactionId,
      transactionHash: input.transactionHash,
      providerState: input.providerState,
    }
    return lifecycleJournal
  },
  recordLifecycle: async input => {
    assert.equal(input.transactionHash, `0x${'9'.repeat(64)}`)
    lifecycleJournal = {
      ...lifecycleJournal,
      status: 'submitted',
      transactionHash: input.transactionHash,
    }
    return { action: lifecycleJournal, replayed: false }
  },
  reconcileLifecycle: async () => {
    lifecycleReconcileCalls += 1
    if (lifecycleJournal?.status === 'confirmed' && !lifecycleJournal.webhookEventId) {
      lifecycleJournal = { ...lifecycleJournal, webhookEventId: 'evt_terminalbackfill1234567890' }
      return { action: lifecycleJournal, pending: false, changed: true }
    }
    return {
      action: lifecycleJournal,
      pending: lifecycleJournal?.status === 'submitted',
      changed: false,
    }
  },
  listOperatorActions: async input => {
    assert.equal(input.partnerId, partnerId)
    assert.equal(input.agreementId, agreementId)
    return operatorAction ? [operatorAction] : []
  },
  approveOperatorAction: async input => {
    assert.equal(input.actionId, operatorAction.id)
    assert.equal(input.requestHash, operatorAction.requestHash)
    assert.equal(input.reviewedBy, identity.userId)
    assert.equal(input.authoritativeNextStep, currentAttempt.lifecycle?.nextStep)
    operatorAction = { ...operatorAction, status: 'queued', reviewedBy: input.reviewedBy, reviewNote: input.reviewNote }
    return operatorAction
  },
  disputeOperatorAction: async input => {
    operatorAction = { ...operatorAction, status: 'disputed', reviewedBy: input.reviewedBy, reviewNote: input.reviewNote }
    return operatorAction
  },
  client: () => ({}),
  env: () => ({
    ARC_AGREEMENTS_ENABLED: 'true',
    ARC_AGREEMENT_PAYER_LIFECYCLE_ENABLED: 'true',
  }),
}
const handler = createArcAgreementPayerHandler(dependencies)
const headers = {
  authorization: 'Bearer privy-token',
  'x-arc-agreement-access': capability,
}

assert.equal((await request(handler, { action: 'review', agreementId }, {
  authorization: 'Bearer privy-token',
})).statusCode, 400)
assert.equal((await request(handler, { action: 'review', agreementId }, {
  ...headers,
  'x-arc-agreement-access': `agrp_${'b'.repeat(43)}`,
})).statusCode, 404)

currentLink = null
const unlinkedReview = await request(handler, { action: 'review', agreementId }, headers)
assert.equal(unlinkedReview.statusCode, 200)
assert.equal(unlinkedReview.body.payer.walletLinked, false)
assert.equal(unlinkedReview.body.payer.walletAddress, null)
assert.equal((await request(handler, {
  action: 'prepare',
  agreementId,
  circleUserToken: 'circle-user-token',
}, headers)).statusCode, 409)
currentLink = link

const review = await request(handler, { action: 'review', agreementId }, headers)
assert.equal(review.statusCode, 200)
assert.equal(review.headers['cache-control'], 'no-store')
assert.equal(review.body.payer.walletAddress, payer)
assert.equal(review.body.payer.walletLinked, true)
assert.equal(review.body.attempt, null)
assert.equal(JSON.stringify(review.body).includes('request-secret'), false)
assert.equal(JSON.stringify(review.body).includes('access-secret'), false)

assert.equal((await request(handler, { action: 'prepare', agreementId }, headers)).statusCode, 401)
const prepared = await request(handler, {
  action: 'prepare',
  agreementId,
  circleUserToken: 'circle-user-token',
}, headers)
assert.equal(prepared.statusCode, 201)
assert.equal(prepared.body.attempt.status, 'awaiting_approval')
assert.equal('payerIdentityHash' in prepared.body.attempt, false)
assert.equal(walletVerifications, 1)

const paused = await request(createArcAgreementPayerHandler({
  ...dependencies,
  prepareAttempt: async () => { throw new Error('Arc Agreement activation is disabled.') },
}), {
  action: 'prepare',
  agreementId,
  circleUserToken: 'circle-user-token',
}, headers)
assert.equal(paused.statusCode, 409)
assert.equal(paused.body.error, 'Agreement activation is currently paused.')

const atCapacity = await request(createArcAgreementPayerHandler({
  ...dependencies,
  prepareAttempt: async () => { throw new Error('This developer project has reached its active Arc Agreement limit.') },
}), {
  action: 'prepare',
  agreementId,
  circleUserToken: 'circle-user-token',
}, headers)
assert.equal(atCapacity.statusCode, 409)
assert.equal(atCapacity.body.error, 'This developer project has reached its active Arc Agreement limit.')

const challenge = await request(handler, {
  action: 'challenge',
  stage: 'approval',
  agreementId,
  circleUserToken: 'circle-user-token',
}, headers)
assert.equal(challenge.statusCode, 200)
assert.equal(challenge.body.challengeId, 'challenge-test-1234')
assert.match(challenge.body.idempotencyKey, /^[0-9a-f-]{36}$/)
assert.equal(challengeInput.walletId, link.circleWalletId)
assert.equal(challengeInput.walletAddress, payer)
assert.equal(challengeInput.callData, '0xabcdef')
assert.deepEqual(challengeOrder, ['reserve', 'prepare'])
assert.match(challengeInput.refId, /^arc-agreement:/)
assert.equal('challenges' in challenge.body.attempt, false)
const reviewWithJournal = await request(handler, { action: 'review', agreementId }, headers)
assert.equal(reviewWithJournal.body.recovery.stage, 'approval')
assert.equal(JSON.stringify(reviewWithJournal.body).includes('challenge-test-1234'), false)
assert.equal(JSON.stringify(reviewWithJournal.body).includes(providerTransactionId), false)

// A new handler instance represents process restart; durable state remains in dependencies.
const restartedHandler = createArcAgreementPayerHandler(dependencies)
const recovered = await request(restartedHandler, {
  action: 'recover',
  stage: 'approval',
  agreementId,
  circleUserToken: 'circle-user-token',
}, headers)
assert.equal(recovered.statusCode, 202)
assert.equal(recovered.body.recovered, true)
assert.equal(recovered.body.attempt.status, 'approval_submitted')
assert.equal(currentJournal.status, 'recorded')

const status = await request(handler, { action: 'status', agreementId }, headers)
assert.equal(status.statusCode, 200)
assert.equal(status.body.pending, true)

// Circle can complete after the browser session disappears. Recover the
// already-bound Arc transaction with activation disabled and without a new OTP.
const activeEscrow = getAddress('0x5555555555555555555555555555555555555555')
currentJournal = {
  ...currentJournal,
  stage: 'activation',
  sequence: 2,
  status: 'transaction_pending',
  transactionHash: `0x${'9'.repeat(64)}`,
  walletAddress: payer,
}
currentAttempt = {
  ...currentAttempt,
  status: 'ready_to_activate',
  challenges: [currentJournal],
}
currentPolicy = null
reconciliationResult = {
  attempt: { ...currentAttempt, status: 'active', escrow: activeEscrow },
  pending: false,
  changed: true,
}
const chainRecoveryReview = await request(handler, { action: 'review', agreementId }, headers)
assert.equal(chainRecoveryReview.statusCode, 200)
assert.equal(chainRecoveryReview.body.recovery.chainSubmitted, true)
const chainRecovered = await request(handler, { action: 'status', agreementId }, headers)
assert.equal(chainRecovered.statusCode, 200)
assert.equal(chainRecovered.body.attempt.status, 'active')
assert.equal(recordedTransactionInput.recoverSubmittedChallenge, true)
assert.deepEqual(recordedTransactionInput.policy, { partnerId })
assert.equal(currentJournal.status, 'recorded')
currentAttempt = reconciliationResult.attempt
reconciliationResult = undefined
operatorAction = {
  id: 'opa_1234567890abcdef12345678',
  partnerId,
  agreementId,
  action: 'release',
  step: 0,
  status: 'awaiting_review',
  deliveryNote: 'Completed the agreed website delivery.',
  evidenceReference: 'https://delivery.example/proof',
  requestHash: 'a'.repeat(64),
  reviewPolicy: 'payer',
  requestedBy: 'did:privy:creator-owner',
  requestedAt: agreement.createdAt,
  updatedAt: agreement.updatedAt,
}

const activeReview = await request(handler, { action: 'review', agreementId }, headers)
assert.equal(activeReview.statusCode, 200)
assert.equal(activeReview.body.lifecycle.available, true)
assert.equal(activeReview.body.lifecycle.enabled, true)
assert.equal(activeReview.body.lifecycle.cancel.eligible, true)
assert.equal(activeReview.body.delivery.status, 'awaiting_review')
assert.equal(activeReview.body.delivery.deliveryNote, 'Completed the agreed website delivery.')
assert.equal(activeReview.body.delivery.canReview, true)
assert.equal('requestHash' in activeReview.body.delivery, false)
currentAttempt = { ...currentAttempt, lifecycle: { status: 'completed', nextStep: 1 } }
const completedReview = await request(handler, { action: 'review', agreementId }, headers)
assert.equal(completedReview.statusCode, 200)
assert.equal(completedReview.body.attempt.lifecycle.status, 'completed')
assert.equal(completedReview.body.delivery, null)
currentAttempt = { ...currentAttempt, lifecycle: { status: 'active', nextStep: 0 } }
operatorAction = { ...operatorAction, requestedBy: identity.userId }
const selfReview = await request(handler, { action: 'review', agreementId }, headers)
assert.equal(selfReview.body.delivery.canReview, false)
assert.equal((await request(handler, {
  action: 'delivery-decision',
  agreementId,
  deliveryId: operatorAction.id,
  decision: 'dispute',
  issue: 'Please add the final deployment link.',
}, headers)).statusCode, 409)
operatorAction = { ...operatorAction, requestedBy: 'did:privy:creator-owner' }
currentAttempt = { ...currentAttempt, lifecycle: { status: 'active', nextStep: 0 } }
const acceptedDelivery = await request(handler, {
  action: 'delivery-decision',
  agreementId,
  deliveryId: operatorAction.id,
  decision: 'accept',
}, headers)
assert.equal(acceptedDelivery.statusCode, 200)
assert.equal(acceptedDelivery.body.delivery.status, 'queued')
assert.equal((await request(handler, {
  action: 'delivery-decision',
  agreementId,
  deliveryId: operatorAction.id,
  decision: 'accept',
}, headers)).body.replayed, true)
refundEligible = true
const expiredDeliveryDecision = await request(handler, {
  action: 'delivery-decision',
  agreementId,
  deliveryId: operatorAction.id,
  decision: 'accept',
}, headers)
assert.equal(expiredDeliveryDecision.statusCode, 409)
assert.match(expiredDeliveryDecision.body.error, /ended.*remaining USDC/i)
refundEligible = false

// Suspending a developer project blocks new activation, but must not strand an
// already-active payer escrow or hide its cancellation/refund controls.
const suspendedReview = await request(handler, { action: 'review', agreementId }, headers)
assert.equal(suspendedReview.statusCode, 200)
assert.equal(suspendedReview.body.attempt.status, 'active')
assert.equal(suspendedReview.body.lifecycle.available, true)
assert.equal((await request(handler, {
  action: 'prepare',
  agreementId,
  circleUserToken: 'circle-user-token',
}, headers)).statusCode, 409)
const lifecycleChallenge = await request(handler, {
  action: 'lifecycle-challenge',
  lifecycleAction: 'cancel',
  agreementId,
  circleUserToken: 'circle-user-token',
}, headers)
assert.equal(lifecycleChallenge.statusCode, 200)
assert.equal(lifecycleChallenge.body.challengeId, 'challenge-test-1234')
assert.equal(lifecycleChallenge.body.lifecycleAction.action, 'cancel')
assert.equal(lifecycleChallenge.body.lifecycleAction.status, 'issued')
assert.equal(challengeInput.callData, '0xcafebabe')
assert.match(challengeInput.refId, /:cancel:0$/)
assert.equal('idempotencyKey' in lifecycleChallenge.body, false)
const lifecycleRecovered = await request(handler, {
  action: 'lifecycle-recover',
  agreementId,
  circleUserToken: 'circle-user-token',
}, headers)
assert.equal(lifecycleRecovered.statusCode, 202)
assert.equal(lifecycleRecovered.body.lifecycleAction.status, 'submitted')
assert.equal('challengeId' in lifecycleRecovered.body, false)
assert.equal('providerTransactionId' in lifecycleRecovered.body, false)
const lifecycleStatus = await request(handler, {
  action: 'lifecycle-status',
  agreementId,
}, headers)
assert.equal(lifecycleStatus.statusCode, 200)
assert.equal(lifecycleStatus.body.pending, true)
const reconcileCallsBeforeBackfill = lifecycleReconcileCalls
lifecycleJournal = { ...lifecycleJournal, status: 'confirmed', webhookEventId: undefined }
const terminalLifecycleReview = await request(handler, { action: 'review', agreementId }, headers)
assert.equal(terminalLifecycleReview.statusCode, 200)
assert.equal(terminalLifecycleReview.body.lifecycle.action.status, 'confirmed')
assert.equal(terminalLifecycleReview.body.lifecycle.action.webhookPending, false)
assert.equal(lifecycleReconcileCalls, reconcileCallsBeforeBackfill + 1)
assert.equal(lifecycleJournal.webhookEventId, 'evt_terminalbackfill1234567890')
currentPolicy = policy

currentIdentity = { ...identity, userId: 'did:privy:other-user-5678' }
currentLink = { ...link, privyUserId: currentIdentity.userId }
assert.equal((await request(handler, { action: 'review', agreementId }, headers)).statusCode, 403)
currentIdentity = identity
currentLink = link

currentAgreement = { ...agreement, checkoutMode: 'agentic' }
assert.equal((await request(handler, { action: 'review', agreementId }, headers)).statusCode, 409)

const serverSource = await readFile(new URL('../server.ts', import.meta.url), 'utf8')
assert.match(serverSource, /app\.post\('\/api\/v2\/agreements\/payer',\s+strictLimiter,\s+arcAgreementPayerHandler\)/)

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const payerPageSource = await readFile(new URL('../src/pages/ArcAgreementPayerPage.tsx', import.meta.url), 'utf8')
assert.match(appSource, /path="agreements\/:agreementId"/)
assert.match(payerPageSource, /x-arc-agreement-access/)
assert.match(payerPageSource, /connectCircleEvmEmailWallet\(email,\s*'arc'\)/)
assert.match(payerPageSource, /linkPocketWallet\(/)
assert.match(payerPageSource, /executeCircleEvmEmailChallenge\(/)
assert.match(payerPageSource, /!isActive\s*&&\s*\(/)
assert.match(payerPageSource, /Keep agreement/)
assert.match(payerPageSource, /Confirm cancellation/)
assert.match(payerPageSource, /Return remaining USDC/)
assert.match(payerPageSource, /action:\s*'lifecycle-challenge'/)
assert.match(payerPageSource, /action:\s*'lifecycle-recover'/)
assert.match(payerPageSource, /action:\s*'lifecycle-status'/)
assert.match(payerPageSource, /action:\s*'delivery-decision'/)
assert.match(payerPageSource, /deliveryId:\s*review\?\.delivery\?\.id/)
assert.match(payerPageSource, /releaseActionLabel/)
assert.match(payerPageSource, /Release milestone/)
assert.match(payerPageSource, /Milestone \$\{delivery\.step \+ 1\}/)
assert.match(payerPageSource, /Report issue/)
assert.match(payerPageSource, /terminalWebhookPending/)
assert.match(payerPageSource, /\['transaction_pending',\s*'submitted'\]\.includes\(lifecycleStatus/)
assert.match(payerPageSource, /review\.lifecycle\?\.action\?\.status\s*!==\s*'confirmed'/)
assert.match(payerPageSource, /let confirmationAccepted = false/)
assert.match(payerPageSource, /status:\s*'transaction_pending'/)
assert.match(payerPageSource, /if \(!confirmationAccepted\)/)
assert.match(payerPageSource, /arc-agreement-change-payer/)
assert.match(payerPageSource, /Use another email/)
assert.match(payerPageSource, /Your payer wallet/)
assert.match(payerPageSource, /setSession\(null\)/)
assert.doesNotMatch(payerPageSource, /Send via Address|ghost.?vault|deposit address/i)
const activePanelSource = payerPageSource.slice(payerPageSource.indexOf('function ActiveAgreementPanel'))
assert.ok(
  activePanelSource.indexOf("if (current?.status === 'confirmed')") < activePanelSource.indexOf('if (delivery)'),
  'Confirmed cancellation or refund must override stale delivery-review UI.',
)

console.log('Arc Agreement authenticated payer adapter smoke checks passed.')
