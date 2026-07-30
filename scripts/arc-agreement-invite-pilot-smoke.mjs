import assert from 'node:assert/strict'
import {
  auditArcAgreementInvitePilot,
  REVIEWED_ARC_AGREEMENT_FACTORY,
  REVIEWED_ARC_AGREEMENT_OPERATOR,
} from '../api/arc-agreement-activation-policy.ts'

const projectId = 'dev_invitepilot1234'
const recipient = '0x2222222222222222222222222222222222222222'
/** @type {import('../api/developer-projects.ts').DeveloperCheckoutPolicy} */
const policy = {
  partnerId: projectId,
  merchantName: 'Invite Pilot',
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
  ARC_AGREEMENTS_ENABLED: 'false',
  ARC_AGREEMENT_RECONCILIATION_WORKER_ENABLED: 'false',
  ARC_AGREEMENT_LIFECYCLE_WORKER_ENABLED: 'false',
  ARC_AGREEMENT_OPERATOR_WORKER_ENABLED: 'false',
  ARC_AGREEMENT_PAYER_LIFECYCLE_ENABLED: 'false',
  ARC_AGREEMENT_FACTORY_ADDRESS: REVIEWED_ARC_AGREEMENT_FACTORY,
  ARC_AGREEMENT_OPERATOR_ADDRESS: REVIEWED_ARC_AGREEMENT_OPERATOR,
  ARC_AGREEMENT_OPERATOR_WALLET_ID: 'e3fe3e85-1111-4111-8111-11111111d4d9',
  ARC_AGREEMENT_ALLOWED_PROJECT_IDS: projectId,
  ARC_AGREEMENT_ALLOWED_CHECKOUT_MODES: 'human',
  ARC_AGREEMENT_MAX_USDC: '1',
  ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '1',
  ARC_AGREEMENT_DAILY_VOLUME_USDC: '1',
  ARC_AGREEMENT_MAX_DURATION_SECONDS: '604800',
  ARC_AGREEMENT_CONFIRMATION_BLOCKS: '5',
  CIRCLE_TEST_API_KEY: 'TEST_API_KEY:test-id:test-secret',
  CIRCLE_ENTITY_SECRET: 'a'.repeat(64),
  PRIVATE_RPC_URL_ARC: 'https://rpc.testnet.arc.network',
}

const result = auditArcAgreementInvitePilot({ policy, env })
assert.equal(result.ok, true)
assert.equal(result.activationEnabled, false)
assert.equal(result.projectId, projectId)
assert.equal(result.amountCeilingUsdcUnits, 1_000_000n)
assert.equal(result.dailyVolumeCeilingUsdcUnits, 1_000_000n)
assert.equal(result.activeAgreementLimit, 1)

assert.throws(() => auditArcAgreementInvitePilot({
  policy,
  env: { ...env, ARC_AGREEMENTS_ENABLED: 'true' },
}), /explicitly set to false/)
const { ARC_AGREEMENT_OPERATOR_WORKER_ENABLED: _operatorWorker, ...missingWorkerFlag } = env
assert.throws(() => auditArcAgreementInvitePilot({
  policy,
  env: missingWorkerFlag,
}), /OPERATOR_WORKER_ENABLED/)
assert.throws(() => auditArcAgreementInvitePilot({
  policy,
  env: { ...env, ARC_AGREEMENT_ALLOWED_PROJECT_IDS: `${projectId},dev_secondpilot1234` },
}), /exactly the selected/)
assert.throws(() => auditArcAgreementInvitePilot({
  policy,
  env: { ...env, ARC_AGREEMENT_ALLOWED_CHECKOUT_MODES: 'human,agentic' },
}), /human checkout only/)
assert.throws(() => auditArcAgreementInvitePilot({
  policy,
  env: { ...env, ARC_AGREEMENT_MAX_USDC: '1.000001' },
}), /no more than 1 test USDC/)
assert.throws(() => auditArcAgreementInvitePilot({
  policy,
  env: { ...env, ARC_AGREEMENT_DAILY_VOLUME_USDC: '2' },
}), /no more than 1 test USDC/)
assert.throws(() => auditArcAgreementInvitePilot({
  policy,
  env: { ...env, ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '2' },
}), /one active agreement/)
assert.throws(() => auditArcAgreementInvitePilot({
  policy,
  env: { ...env, ARC_AGREEMENT_MAX_DURATION_SECONDS: '604801' },
}), /604800/)
assert.throws(() => auditArcAgreementInvitePilot({
  policy: { ...policy, webhookConfigured: false },
  env,
}), /signed developer webhook/)

console.log('Arc Agreement invite pilot smoke checks passed.')
