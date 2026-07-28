import assert from 'node:assert/strict'
import { arcAgreementClientReference, arcAgreementTerms } from '../api/arc-agreement-terms.ts'
import { prepareArcAgreementDeployment } from '../api/arc-agreement-reconciliation.ts'
import {
  buildArcAgreementWebhookEvent,
  drainArcAgreementWebhookOutbox,
  readConfirmedArcAgreementSnapshot,
  reconcileAndQueueArcAgreementWebhook,
} from '../api/arc-agreement-webhooks.ts'
import { buildDeveloperWebhookRequest } from '../api/developer-projects.ts'
import {
  ARC_AGREEMENT_NETWORK,
  arcAgreementRuntimeConfig,
  assertArcAgreementNetwork,
} from '../api/arc-agreement-config.ts'

const partnerId = 'dev_agreementwebhook1234'
const draftId = 'agr_agreementwebhook1234'
const payer = '0x1111111111111111111111111111111111111111'
const recipient = '0x2222222222222222222222222222222222222222'
const factory = '0x3333333333333333333333333333333333333333'
const operator = '0x4444444444444444444444444444444444444444'
const usdc = '0x3600000000000000000000000000000000000000'
const escrow = '0x5555555555555555555555555555555555555555'
assert.equal(ARC_AGREEMENT_NETWORK.chainId, 5_042_002)
assert.equal(ARC_AGREEMENT_NETWORK.circleDomain, 26)
assert.equal(ARC_AGREEMENT_NETWORK.usdc, usdc)
assert.deepEqual(assertArcAgreementNetwork({ chainId: 5_042_002, usdc }), { chainId: 5_042_002, usdc })
assert.throws(
  () => assertArcAgreementNetwork({ chainId: 8453, usdc }),
  /requires chain 5042002/,
)
assert.throws(
  () => assertArcAgreementNetwork({ chainId: 5_042_002, usdc: payer }),
  /official Arc Testnet USDC/,
)
const runtime = arcAgreementRuntimeConfig({
  ARC_AGREEMENT_FACTORY_ADDRESS: factory,
  ARC_AGREEMENT_OPERATOR_ADDRESS: operator,
  PRIVATE_RPC_URL_ARC: 'https://private-rpc.example/arc',
  ARC_AGREEMENT_CONFIRMATION_BLOCKS: '7',
})
assert.equal(runtime.factory, factory)
assert.equal(runtime.operator, operator)
assert.equal(runtime.confirmations, 7)
assert.throws(() => arcAgreementRuntimeConfig({
  ARC_AGREEMENT_FACTORY_ADDRESS: factory,
  ARC_AGREEMENT_OPERATOR_ADDRESS: factory,
}), /must be different/)
assert.throws(() => arcAgreementRuntimeConfig({
  ARC_AGREEMENT_FACTORY_ADDRESS: factory,
  ARC_AGREEMENT_OPERATOR_ADDRESS: operator,
  PRIVATE_RPC_URL_ARC: 'http://insecure.example',
}), /must be an HTTPS URL/)

const terms = arcAgreementTerms({
  template: 'progressive_release',
  resourceId: 'service:agreement-webhook-test',
  title: 'Agreement webhook test',
  description: 'Verify confirmed and idempotent agreement webhook delivery.',
  amount: '10',
  recipient,
  checkpoints: [{ percentage: 25 }, { percentage: 50 }, { percentage: 100 }],
  durationSeconds: 86_400,
  cancellationWindowSeconds: 900,
})
const clientReference = arcAgreementClientReference(partnerId, draftId)
const prepared = prepareArcAgreementDeployment({
  draft: { clientReference, termsHash: terms.termsHash, chainTerms: terms },
  payer,
  factory,
  operator,
  usdc,
  activationTimestamp: 1_785_240_000,
})
const releasedAmount = prepared.totalAmount * 2_500n / 10_000n
const values = {
  agreementId: prepared.agreementId,
  clientReference: prepared.clientReference,
  termsHash: prepared.termsHash,
  factory: prepared.factory,
  payer: prepared.payer,
  recipient: prepared.recipient,
  operator: prepared.operator,
  usdc: prepared.usdc,
  template: prepared.templateCode,
  totalAmount: prepared.totalAmount,
  cancelUntil: prepared.cancelUntil,
  expiresAt: prepared.expiresAt,
  status: 1,
  nextStep: 1,
  releasedAmount,
  releaseSchedule: prepared.cumulativeReleaseBps,
}
const observedReads = []
const client = {
  getChainId: async () => 5_042_002,
  getBlockNumber: async () => 100n,
  readContract: async args => {
    observedReads.push(args)
    return args.functionName === 'balanceOf'
      ? prepared.totalAmount - releasedAmount
      : values[args.functionName]
  },
}

const confirmed = await readConfirmedArcAgreementSnapshot(client, escrow, 5)
assert.equal(confirmed.headBlockNumber, 100n)
assert.equal(confirmed.observedBlockNumber, 95n)
assert.equal(confirmed.confirmations, 5)
assert.ok(observedReads.length > 1)
assert.ok(observedReads.every(read => read.blockNumber === 95n))

await assert.rejects(
  readConfirmedArcAgreementSnapshot({ ...client, getBlockNumber: async () => 2n }, escrow, 5),
  /too young/,
)
await assert.rejects(readConfirmedArcAgreementSnapshot(client, escrow, 0), /confirmationBlocks/)

let store
let clock = new Date('2026-07-28T12:00:00.000Z')
let deliveryAttempt = 0
const signedAttempts = []
const dependencies = {
  hasStore: () => true,
  mutate: async (_key, update) => {
    store = update(store)
    return store
  },
  notify: async (_partnerId, event, data, delivery) => {
    deliveryAttempt += 1
    signedAttempts.push(buildDeveloperWebhookRequest(
      'whsec_arc-agreement-test',
      event,
      data,
      {
        eventId: delivery.eventId,
        createdAt: delivery.createdAt,
        attemptedAt: clock.toISOString(),
      },
    ))
    if (deliveryAttempt === 1) throw new Error('temporary receiver failure')
  },
  now: () => new Date(clock),
}

const first = await reconcileAndQueueArcAgreementWebhook({
  client,
  partnerId,
  agreementId: draftId,
  prepared,
  escrow,
  confirmationBlocks: 5,
}, dependencies)
assert.equal(first.replayed, false)
assert.equal(first.event.event, 'agreement.step_released')
assert.equal(first.event.data.status, 'active')
assert.equal(first.event.data.observedBlockNumber, '95')
assert.equal(Object.keys(store.events).length, 1)

clock = new Date('2026-07-28T12:00:05.000Z')
const replay = await reconcileAndQueueArcAgreementWebhook({
  client,
  partnerId,
  agreementId: draftId,
  prepared,
  escrow,
  confirmationBlocks: 5,
}, dependencies)
assert.equal(replay.replayed, true)
assert.equal(replay.event.id, first.event.id)
assert.equal(replay.event.createdAt, first.event.createdAt)
assert.equal(Object.keys(store.events).length, 1)

assert.equal(await drainArcAgreementWebhookOutbox(dependencies), 0)
assert.equal(store.events[first.event.id].status, 'pending')
assert.equal(store.events[first.event.id].attempts, 1)

clock = new Date('2026-07-28T12:00:36.000Z')
assert.equal(await drainArcAgreementWebhookOutbox(dependencies), 1)
assert.equal(store.events[first.event.id].status, 'delivered')
assert.equal(store.events[first.event.id].attempts, 2)
assert.equal(signedAttempts.length, 2)
assert.equal(signedAttempts[0].eventId, signedAttempts[1].eventId)
assert.equal(signedAttempts[0].payload, signedAttempts[1].payload)
assert.notEqual(signedAttempts[0].timestamp, signedAttempts[1].timestamp)
assert.notEqual(signedAttempts[0].signature, signedAttempts[1].signature)

const completed = buildArcAgreementWebhookEvent({
  partnerId,
  agreementId: draftId,
  prepared,
  snapshot: {
    ...confirmed.snapshot,
    status: 2,
    nextStep: prepared.cumulativeReleaseBps.length,
    releasedAmount: prepared.totalAmount,
    tokenBalance: 0n,
  },
  observedBlockNumber: 95n,
  createdAt: clock.toISOString(),
})
assert.equal(completed.event, 'agreement.completed')

assert.throws(() => buildArcAgreementWebhookEvent({
  partnerId,
  agreementId: draftId,
  prepared,
  snapshot: { ...confirmed.snapshot, termsHash: `0x${'ff'.repeat(32)}` },
  observedBlockNumber: 95n,
  createdAt: clock.toISOString(),
}), /termsHash/)

assert.throws(() => buildArcAgreementWebhookEvent({
  partnerId,
  agreementId: draftId,
  prepared,
  snapshot: {
    ...confirmed.snapshot,
    status: 0,
    nextStep: 0,
    releasedAmount: 0n,
    tokenBalance: prepared.totalAmount,
  },
  observedBlockNumber: 95n,
  createdAt: clock.toISOString(),
}), /inactiveState/)

console.log('Arc Agreement confirmed-chain webhook smoke checks passed.')
