import { getAddress, isAddress, type Address } from 'viem'
import {
  ARC_AGREEMENT_NETWORK,
  arcAgreementRuntimeConfig,
} from './arc-agreement-config.js'
import {
  prepareArcAgreementDeployment,
  type ArcAgreementDraftBinding,
} from './arc-agreement-reconciliation.js'
import type { DeveloperCheckoutMode, DeveloperCheckoutPolicy } from './developer-projects.js'

export const REVIEWED_ARC_AGREEMENT_FACTORY = getAddress('0xe828795f52b3d6902b982ab7266aaae404d7cea5')
export const REVIEWED_ARC_AGREEMENT_OPERATOR = getAddress('0xd55d6ba98eABeCeCD24C84e715b13157ee4fCb49')

const PROJECT_ID = /^dev_[a-z0-9]{8,64}$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ENTITY_SECRET = /^[0-9a-f]{64}$/i
const TEST_API_KEY = /^TEST_API_KEY:[^:\s]+:[^:\s]+$/
const MAX_PILOT_USDC_UNITS = 1_000_000_000n
const MAX_PILOT_DURATION_SECONDS = 2_592_000

export type ArcAgreementActivationAuthorization = Readonly<{
  authorized: true
  partnerId: string
  checkoutMode: DeveloperCheckoutMode
  amountCeilingUsdcUnits: bigint
  durationCeilingSeconds: number
  factory: Address
  operator: Address
  confirmationBlocks: number
}>

function required(value: unknown, name: string) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${name} is required before Arc Agreement activation.`)
  return normalized
}

function commaSeparated(value: unknown) {
  return Array.from(new Set(
    String(value ?? '')
      .split(',')
      .map(item => item.trim().toLowerCase())
      .filter(Boolean),
  ))
}

function allowedProjects(value: unknown) {
  const projects = commaSeparated(value)
  if (!projects.length || projects.some(project => !PROJECT_ID.test(project))) {
    throw new Error('ARC_AGREEMENT_ALLOWED_PROJECT_IDS must contain explicit developer project ids.')
  }
  return new Set(projects)
}

function allowedCheckoutModes(value: unknown) {
  const modes = commaSeparated(value)
  if (!modes.length || modes.some(mode => mode !== 'human' && mode !== 'agentic')) {
    throw new Error('ARC_AGREEMENT_ALLOWED_CHECKOUT_MODES must explicitly list human, agentic, or both.')
  }
  return new Set(modes as DeveloperCheckoutMode[])
}

function amountCeiling(value: unknown) {
  const normalized = required(value, 'ARC_AGREEMENT_MAX_USDC')
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(normalized)) {
    throw new Error('ARC_AGREEMENT_MAX_USDC must be a positive USDC amount with at most 6 decimals.')
  }
  const [whole, fraction = ''] = normalized.split('.')
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
  if (units <= 0n || units > MAX_PILOT_USDC_UNITS) {
    throw new Error('ARC_AGREEMENT_MAX_USDC must be greater than 0 and no more than 1,000 test USDC.')
  }
  return units
}

function durationCeiling(value: unknown) {
  const parsed = Number(required(value, 'ARC_AGREEMENT_MAX_DURATION_SECONDS'))
  if (!Number.isInteger(parsed) || parsed < 3_600 || parsed > MAX_PILOT_DURATION_SECONDS) {
    throw new Error('ARC_AGREEMENT_MAX_DURATION_SECONDS must be from 3600 to 2592000 seconds.')
  }
  return parsed
}

function requireOperatorConfiguration(env: NodeJS.ProcessEnv) {
  const walletId = required(env.ARC_AGREEMENT_OPERATOR_WALLET_ID, 'ARC_AGREEMENT_OPERATOR_WALLET_ID')
  if (!UUID.test(walletId)) throw new Error('ARC_AGREEMENT_OPERATOR_WALLET_ID is invalid.')
  if (!TEST_API_KEY.test(required(env.CIRCLE_TEST_API_KEY, 'CIRCLE_TEST_API_KEY'))) {
    throw new Error('CIRCLE_TEST_API_KEY must be a Circle test API key.')
  }
  if (!ENTITY_SECRET.test(required(env.CIRCLE_ENTITY_SECRET, 'CIRCLE_ENTITY_SECRET'))) {
    throw new Error('CIRCLE_ENTITY_SECRET must be the registered 32-byte hexadecimal entity secret.')
  }
}

function requireProjectPolicy(
  policy: DeveloperCheckoutPolicy,
  allowedProjectIds: Set<string>,
  allowedModes: Set<DeveloperCheckoutMode>,
) {
  if (!allowedProjectIds.has(policy.partnerId.toLowerCase())) {
    throw new Error('This developer project is not allowlisted for Arc Agreement activation.')
  }
  if (!allowedModes.has(policy.checkoutMode)) {
    throw new Error('This checkout mode is not allowlisted for Arc Agreement activation.')
  }
  if (policy.environment !== 'test') throw new Error('Arc Agreement activation requires a test API key.')
  if (policy.settlementMode !== 'usdc') throw new Error('Arc Agreement activation requires USDC settlement.')
  if (!policy.capabilities.includes('arc_agreements')) {
    throw new Error('This developer project has not enabled Arc Agreements.')
  }
  if (!policy.webhookConfigured) {
    throw new Error('A signed developer webhook is required before Arc Agreement activation.')
  }
  const arcRoute = policy.paymentOptions.find(option => option.network === 'arc')
  if (!arcRoute || !isAddress(arcRoute.recipient)) {
    throw new Error('Arc Agreement activation requires a configured Arc Testnet recipient.')
  }
  return getAddress(arcRoute.recipient)
}

export function authorizeArcAgreementActivation(input: {
  policy: DeveloperCheckoutPolicy
  draft: ArcAgreementDraftBinding
  payer: string
  activationTimestamp: number
  env?: NodeJS.ProcessEnv
}) {
  const env = input.env ?? process.env
  if (String(env.ARC_AGREEMENTS_ENABLED ?? '').trim().toLowerCase() !== 'true') {
    throw new Error('Arc Agreement activation is disabled.')
  }
  const runtime = arcAgreementRuntimeConfig(env)
  if (runtime.factory !== REVIEWED_ARC_AGREEMENT_FACTORY) {
    throw new Error('ARC_AGREEMENT_FACTORY_ADDRESS does not match the reviewed Arc Testnet factory.')
  }
  if (runtime.operator !== REVIEWED_ARC_AGREEMENT_OPERATOR) {
    throw new Error('ARC_AGREEMENT_OPERATOR_ADDRESS does not match the reviewed immutable operator.')
  }
  if (runtime.confirmations < 5) {
    throw new Error('Arc Agreement activation requires at least 5 confirmation blocks.')
  }

  const allowedProjectIds = allowedProjects(env.ARC_AGREEMENT_ALLOWED_PROJECT_IDS)
  const allowedModes = allowedCheckoutModes(env.ARC_AGREEMENT_ALLOWED_CHECKOUT_MODES)
  const ceiling = amountCeiling(env.ARC_AGREEMENT_MAX_USDC)
  const maxDuration = durationCeiling(env.ARC_AGREEMENT_MAX_DURATION_SECONDS)
  requireOperatorConfiguration(env)
  const configuredRecipient = requireProjectPolicy(input.policy, allowedProjectIds, allowedModes)

  if (getAddress(input.draft.chainTerms.recipient) !== configuredRecipient) {
    throw new Error('Agreement recipient must match the project Arc Testnet recipient.')
  }
  const amount = BigInt(input.draft.chainTerms.amountUsdcUnits)
  if (amount > ceiling) throw new Error('Agreement amount exceeds the configured testnet activation ceiling.')
  if (input.draft.chainTerms.durationSeconds > maxDuration) {
    throw new Error('Agreement duration exceeds the configured testnet activation ceiling.')
  }

  const prepared = prepareArcAgreementDeployment({
    draft: input.draft,
    payer: input.payer,
    factory: runtime.factory,
    operator: runtime.operator,
    usdc: ARC_AGREEMENT_NETWORK.usdc,
    activationTimestamp: input.activationTimestamp,
  })
  const authorization: ArcAgreementActivationAuthorization = Object.freeze({
    authorized: true,
    partnerId: input.policy.partnerId,
    checkoutMode: input.policy.checkoutMode,
    amountCeilingUsdcUnits: ceiling,
    durationCeilingSeconds: maxDuration,
    factory: runtime.factory,
    operator: runtime.operator,
    confirmationBlocks: runtime.confirmations,
  })
  return Object.freeze({ authorization, prepared })
}
