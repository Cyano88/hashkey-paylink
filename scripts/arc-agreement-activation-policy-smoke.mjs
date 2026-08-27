import assert from 'node:assert/strict'
import { arcAgreementClientReference, arcAgreementTerms } from '../api/arc-agreement-terms.ts'
import {
  authorizeArcAgreementActivation,
  REVIEWED_ARC_AGREEMENT_FACTORY,
  REVIEWED_ARC_AGREEMENT_OPERATOR,
} from '../api/arc-agreement-activation-policy.ts'

const partnerId = 'dev_activationpilot1234'
const recipient = '0x2222222222222222222222222222222222222222'
const payer = '0x3333333333333333333333333333333333333333'
const agreementId = 'agr_activationpilot1234'
const chainTerms = arcAgreementTerms({
  template: 'fixed_unlock',
  externalId: 'activation-001',
  resourceId: 'content:activation-test',
  title: 'Activation policy test',
  description: 'Verify the fail-closed Arc activation policy boundary.',
  amount: '10',
  recipient,
  durationSeconds: 86_400,
  cancellationWindowSeconds: 900,
})
const draft = {
  clientReference: arcAgreementClientReference(partnerId, agreementId),
  termsHash: chainTerms.termsHash,
  chainTerms,
}
const policy = {
  partnerId,
  merchantName: 'Activation Pilot',
  allowedOrigins: ['https://pilot.example'],
  defaultNetwork: 'arc',
  paymentOptions: [{ network: 'arc', recipient }],
  settlementMode: 'usdc',
  environment: 'test',
  checkoutMode: 'human',
  capabilities: ['arc_agreements'],
  webhookConfigured: true,
  projectManaged: true,
}
const env = {
  ARC_AGREEMENTS_ENABLED: 'true',
  ARC_AGREEMENT_FACTORY_ADDRESS: REVIEWED_ARC_AGREEMENT_FACTORY,
  ARC_AGREEMENT_OPERATOR_ADDRESS: REVIEWED_ARC_AGREEMENT_OPERATOR,
  ARC_AGREEMENT_OPERATOR_WALLET_ID: 'e3fe3e85-1111-4111-8111-11111111d4d9',
  ARC_AGREEMENT_ALLOWED_PROJECT_IDS: partnerId,
  ARC_AGREEMENT_ALLOWED_CHECKOUT_MODES: 'human',
  ARC_AGREEMENT_MAX_USDC: '25',
  ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '3',
  ARC_AGREEMENT_DAILY_VOLUME_USDC: '50',
  ARC_AGREEMENT_MAX_DURATION_SECONDS: '2592000',
  ARC_AGREEMENT_CONFIRMATION_BLOCKS: '5',
  CIRCLE_TEST_API_KEY: 'TEST_API_KEY:test-id:test-secret',
  CIRCLE_ENTITY_SECRET: 'a'.repeat(64),
  PRIVATE_RPC_URL_ARC: 'https://rpc.testnet.arc.network',
}
const activationTimestamp = 1_785_283_200

assert.throws(() => authorizeArcAgreementActivation({
  policy, draft, payer, activationTimestamp, env: { ...env, ARC_AGREEMENTS_ENABLED: 'false' },
}), /disabled/)
assert.throws(() => authorizeArcAgreementActivation({
  policy, draft, payer, activationTimestamp, env: { ...env, ARC_AGREEMENT_ALLOWED_PROJECT_IDS: 'dev_otherproject1234' },
}), /not allowlisted/)
assert.throws(() => authorizeArcAgreementActivation({
  policy: { ...policy, webhookConfigured: false }, draft, payer, activationTimestamp, env,
}), /signed developer webhook/)
assert.throws(() => authorizeArcAgreementActivation({
  policy: { ...policy, paymentOptions: [{ network: 'arc', recipient: payer }] }, draft, payer, activationTimestamp, env,
}), /recipient must match/)
assert.throws(() => authorizeArcAgreementActivation({
  policy, draft: { ...draft, chainTerms: { ...draft.chainTerms, amountUsdcUnits: '26000000' } }, payer, activationTimestamp, env,
}), /amount exceeds/)
assert.throws(() => authorizeArcAgreementActivation({
  policy, draft: { ...draft, chainTerms: { ...draft.chainTerms, durationSeconds: 2_592_001 } }, payer, activationTimestamp, env,
}), /duration exceeds/)
assert.throws(() => authorizeArcAgreementActivation({
  policy, draft, payer, activationTimestamp, env: { ...env, ARC_AGREEMENT_FACTORY_ADDRESS: payer },
}), /reviewed Arc Testnet factory/)
assert.throws(() => authorizeArcAgreementActivation({
  policy, draft, payer, activationTimestamp, env: { ...env, CIRCLE_TEST_API_KEY: 'LIVE_API_KEY:id:secret' },
}), /Circle test API key/)
assert.throws(() => authorizeArcAgreementActivation({
  policy, draft, payer, activationTimestamp, env: { ...env, ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '0' },
}), /MAX_ACTIVE_PER_PROJECT/)
assert.throws(() => authorizeArcAgreementActivation({
  policy, draft, payer, activationTimestamp, env: { ...env, ARC_AGREEMENT_DAILY_VOLUME_USDC: '0' },
}), /DAILY_VOLUME_USDC/)

const authorized = authorizeArcAgreementActivation({ policy, draft, payer, activationTimestamp, env })
assert.equal(authorized.authorization.authorized, true)
assert.equal(authorized.authorization.partnerId, partnerId)
assert.equal(authorized.authorization.amountCeilingUsdcUnits, 25_000_000n)
assert.equal(authorized.authorization.activeAgreementLimit, 3)
assert.equal(authorized.authorization.dailyVolumeCeilingUsdcUnits, 50_000_000n)
assert.equal(authorized.authorization.durationCeilingSeconds, 2_592_000)
assert.equal(authorized.authorization.factory, REVIEWED_ARC_AGREEMENT_FACTORY)
assert.equal(authorized.authorization.operator, REVIEWED_ARC_AGREEMENT_OPERATOR)
assert.equal(authorized.prepared.totalAmount, 10_000_000n)
assert.equal(authorized.prepared.payer, payer)
assert.equal(authorized.prepared.recipient, recipient)

const approvedPolicy = {
  ...policy,
  arcAgreementPilot: {
    status: 'approved',
    maxAgreementUsdc: '20',
    dailyVolumeUsdc: '30',
    maxActiveAgreements: 2,
    maxDurationSeconds: 86_400,
    updatedAt: new Date().toISOString(),
    updatedBy: 'operations@example.com',
  },
}
assert.throws(() => authorizeArcAgreementActivation({
  policy: { ...policy, arcAgreementPilot: { ...approvedPolicy.arcAgreementPilot, status: 'draft_only' } },
  draft, payer, activationTimestamp, env,
}), /awaiting project approval/)
assert.throws(() => authorizeArcAgreementActivation({
  policy: { ...policy, arcAgreementPilot: { ...approvedPolicy.arcAgreementPilot, status: 'disabled' } },
  draft, payer, activationTimestamp, env,
}), /disabled for this developer project/)
assert.throws(() => authorizeArcAgreementActivation({
  policy: approvedPolicy,
  draft: { ...draft, chainTerms: { ...draft.chainTerms, amountUsdcUnits: '21000000' } },
  payer,
  activationTimestamp,
  env: { ...env, ARC_AGREEMENT_ALLOWED_PROJECT_IDS: 'dev_otherproject1234' },
}), /amount exceeds/)
const durableAuthorized = authorizeArcAgreementActivation({
  policy: approvedPolicy,
  draft,
  payer,
  activationTimestamp,
  env: { ...env, ARC_AGREEMENT_ALLOWED_PROJECT_IDS: 'dev_otherproject1234' },
})
assert.equal(durableAuthorized.authorization.amountCeilingUsdcUnits, 20_000_000n)
assert.equal(durableAuthorized.authorization.dailyVolumeCeilingUsdcUnits, 30_000_000n)
assert.equal(durableAuthorized.authorization.activeAgreementLimit, 2)
assert.equal(durableAuthorized.authorization.durationCeilingSeconds, 86_400)

const projectManagedLimits = authorizeArcAgreementActivation({
  policy: {
    ...approvedPolicy,
    arcAgreementPilot: {
      ...approvedPolicy.arcAgreementPilot,
      maxAgreementUsdc: '40',
      dailyVolumeUsdc: '60',
      maxActiveAgreements: 100,
      maxDurationSeconds: 604_800,
    },
  },
  draft,
  payer,
  activationTimestamp,
  env: {
    ...env,
    ARC_AGREEMENT_MAX_USDC: '0',
    ARC_AGREEMENT_DAILY_VOLUME_USDC: '0',
    ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '0',
    ARC_AGREEMENT_MAX_DURATION_SECONDS: '0',
  },
})
assert.equal(projectManagedLimits.authorization.amountCeilingUsdcUnits, 40_000_000n)
assert.equal(projectManagedLimits.authorization.dailyVolumeCeilingUsdcUnits, 60_000_000n)
assert.equal(projectManagedLimits.authorization.activeAgreementLimit, 100)
assert.equal(projectManagedLimits.authorization.durationCeilingSeconds, 604_800)

console.log('Arc Agreement activation policy smoke checks passed.')
