import { createHash } from 'node:crypto'
import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  isAddress,
  parseAbi,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem'
import {
  authorizeArcAgreementActivation,
  type ArcAgreementActivationAuthorization,
} from './arc-agreement-activation-policy.js'
import {
  prepareArcAgreementDeployment,
  readArcAgreementSnapshot,
  reconcileArcAgreementSnapshot,
  type ArcAgreementDraftBinding,
  type ArcAgreementPreparedDeployment,
} from './arc-agreement-reconciliation.js'
import type { DeveloperCheckoutPolicy } from './developer-projects.js'
import {
  buildArcAgreementWebhookEvent,
  queueArcAgreementWebhookEvent,
  type ArcAgreementWebhookEvent,
} from './arc-agreement-webhooks.js'
import {
  hasRenderDurableStore,
  mutateDurableJson,
  readDurableJson,
} from './render-durable-store.js'

const STORE_KEY = (process.env.ARC_AGREEMENT_ACTIVATION_STORE_KEY
  ?? 'hashpaylink:arc-agreement-activation-attempts:v1').trim()
const AGREEMENT_ID = /^agr_[a-z0-9]{12,64}$/i
const TRANSACTION_HASH = /^0x[0-9a-f]{64}$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_CONFIRMATIONS = 128

const erc20Abi = parseAbi([
  'function approve(address spender,uint256 amount) returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)',
])
const factoryAbi = parseAbi([
  'function agreementEscrow(bytes32 agreementId) view returns (address)',
  'function createAndFund((bytes32 clientReference,bytes32 termsHash,address recipient,uint8 template,uint256 totalAmount,uint64 cancelUntil,uint64 expiresAt,uint16[] cumulativeReleaseBps) params) returns (address)',
])
const smartWalletAbi = parseAbi([
  'function executeBatch((address target,uint256 value,bytes data)[] calls)',
])
const entryPointV06Abi = parseAbi([
  'function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,uint256 callGasLimit,uint256 verificationGasLimit,uint256 preVerificationGas,uint256 maxFeePerGas,uint256 maxPriorityFeePerGas,bytes paymasterAndData,bytes signature)[] ops,address payable beneficiary)',
])
const circleAccountAbi = parseAbi([
  'function execute(address dest,uint256 value,bytes func)',
])
const ENTRY_POINT_V06 = getAddress('0x5FF137D4b0FDcd49DCa30c7CF57E578a026d2789')

export type ArcAgreementActivationStatus =
  | 'awaiting_approval'
  | 'approval_submitted'
  | 'ready_to_activate'
  | 'activation_submitted'
  | 'active'
  | 'approval_failed'
  | 'activation_failed'
  | 'reconciliation_failed'

type StoredPreparedDeployment = {
  chainId: 5042002
  agreementId: Hex
  deploymentHash: Hex
  clientReference: Hex
  termsHash: Hex
  factory: Address
  payer: Address
  recipient: Address
  operator: Address
  usdc: Address
  templateCode: number
  totalAmount: string
  cancelUntil: string
  expiresAt: string
  cumulativeReleaseBps: number[]
}

export type ArcAgreementPayerCall = Readonly<{
  chainId: 5042002
  to: Address
  data: Hex
  value: '0'
}>

export type ArcAgreementPayerTransaction = {
  hash: Hex
  stage: 'approval' | 'activation'
  status: 'submitted' | 'confirmed' | 'failed'
  execution: 'direct' | 'circle_smart_wallet' | 'circle_user_operation'
  submittedAt: string
  confirmedAt?: string
  blockNumber?: string
  failure?: 'transaction_reverted' | 'allowance_not_confirmed' | 'escrow_not_created' | 'escrow_mismatch'
}

export type ArcAgreementPayerChallenge = {
  idempotencyKey: string
  stage: 'approval' | 'activation'
  sequence: number
  status: 'reserved' | 'issued' | 'transaction_pending' | 'recorded' | 'provider_failed' | 'manual_review'
  walletId: string
  walletAddress: Address
  challengeId?: string
  providerTransactionId?: string
  transactionHash?: Hex
  providerState?: string
  createdAt: string
  updatedAt: string
}

export type ArcAgreementAgentCallPreparation = {
  stage: 'approval' | 'activation'
  sequence: number
  deploymentHash: Hex
  preparedAt: string
}

export type ArcAgreementLifecycleObservation = {
  status: 'active' | 'expired' | 'completed' | 'cancelled' | 'refunded'
  nextStep: number
  releasedAmountUsdcUnits: string
  obligationAmountUsdcUnits: string
  excessAmountUsdcUnits: string
  observedBlockNumber: string
  observedBlockTimestamp: string
  eventId: string
  observedAt: string
}

export type ArcAgreementCapacityReservation = {
  utcDay: string
  amountUsdcUnits: string
  reservedAt: string
}

export type ArcAgreementActivationAttempt = {
  id: string
  partnerId: string
  agreementId: string
  payerIdentityHash: string
  checkoutMode: 'human' | 'agentic'
  status: ArcAgreementActivationStatus
  authorization: Omit<
    ArcAgreementActivationAuthorization,
    'amountCeilingUsdcUnits' | 'dailyVolumeCeilingUsdcUnits'
  > & {
    amountCeilingUsdcUnits: string
    dailyVolumeCeilingUsdcUnits: string
  }
  prepared: StoredPreparedDeployment
  calls: {
    approval: ArcAgreementPayerCall
    activation: ArcAgreementPayerCall
  }
  transactions: ArcAgreementPayerTransaction[]
  challenges?: ArcAgreementPayerChallenge[]
  agentCallPreparations?: ArcAgreementAgentCallPreparation[]
  activationTimestamp: number
  escrow?: Address
  observedBlockNumber?: string
  activationWebhookEventId?: string
  lifecycle?: ArcAgreementLifecycleObservation
  capacityReservation?: ArcAgreementCapacityReservation
  createdAt: string
  updatedAt: string
}

type ArcAgreementActivationStore = {
  attempts: Record<string, ArcAgreementActivationAttempt>
  transactionIndex: Record<string, { attemptId: string; stage: 'approval' | 'activation' }>
  reconciliationJobs?: Record<string, ArcAgreementActivationReconciliationJob>
  lifecycleJobs?: Record<string, ArcAgreementActivationReconciliationJob>
}

type ArcAgreementActivationReconciliationJob = {
  attempts: number
  leaseToken?: string
  leaseUntil?: string
  lastAttemptAt?: string
  nextAttemptAt?: string
  lastError?: string
}

export type ArcAgreementActivationReconciliationClaim = {
  attemptId: string
  partnerId: string
  agreementId: string
  leaseToken: string
}

export type ArcAgreementLifecycleReconciliationClaim = {
  attemptId: string
  partnerId: string
  agreementId: string
  escrow: Address
  prepared: ArcAgreementPreparedDeployment
  lastEventId?: string
  lastObservedBlockNumber?: string
  lastObservedBlockTimestamp?: string
  lastStatus?: ArcAgreementLifecycleObservation['status']
  lastNextStep?: number
  lastReleasedAmountUsdcUnits?: string
  leaseToken: string
}

type TransactionObservation = {
  hash: Hex
  from: Address
  to: Address | null
  input: Hex
  value: bigint
}

type ReceiptObservation = {
  status: 'success' | 'reverted'
  blockNumber: bigint
}

export type ArcAgreementActivationClient = {
  getChainId: () => Promise<number>
  getBlockNumber: () => Promise<bigint>
  getBlock: (args: { blockNumber: bigint }) => Promise<{ timestamp: bigint }>
  getTransaction: (args: { hash: Hex }) => Promise<TransactionObservation>
  getTransactionReceipt: (args: { hash: Hex }) => Promise<ReceiptObservation | null>
  readContract: (args: {
    address: Address
    abi: readonly unknown[]
    functionName: string
    args?: readonly unknown[]
    blockNumber?: bigint
  }) => Promise<unknown>
}

type Dependencies = {
  hasStore: () => boolean
  read: (key: string) => Promise<ArcAgreementActivationStore | undefined>
  mutate: (
    key: string,
    update: (
      current: ArcAgreementActivationStore | undefined,
    ) => ArcAgreementActivationStore | Promise<ArcAgreementActivationStore>,
  ) => Promise<ArcAgreementActivationStore>
  queueWebhook: (event: ArcAgreementWebhookEvent) => Promise<unknown>
  now: () => Date
}

const defaults: Dependencies = {
  hasStore: hasRenderDurableStore,
  read: readDurableJson,
  mutate: (key, update) => mutateDurableJson<ArcAgreementActivationStore>(key, update),
  queueWebhook: queueArcAgreementWebhookEvent,
  now: () => new Date(),
}

function safeStore(current: ArcAgreementActivationStore | undefined): ArcAgreementActivationStore {
  return {
    attempts: { ...(current?.attempts ?? {}) },
    transactionIndex: { ...(current?.transactionIndex ?? {}) },
    reconciliationJobs: { ...(current?.reconciliationJobs ?? {}) },
    lifecycleJobs: { ...(current?.lifecycleJobs ?? {}) },
  }
}

function reconciliationEligible(attempt: ArcAgreementActivationAttempt | undefined) {
  return attempt?.status === 'approval_submitted' || attempt?.status === 'activation_submitted'
}

function lifecycleReconciliationEligible(attempt: ArcAgreementActivationAttempt | undefined) {
  return Boolean(
    attempt?.status === 'active'
    && attempt.escrow
    && !['completed', 'cancelled', 'refunded'].includes(attempt.lifecycle?.status ?? ''),
  )
}

function validFuture(value: string | undefined, nowMs: number) {
  if (!value) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp > nowMs
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = value ?? fallback
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Value must be a whole number from ${minimum} to ${maximum}.`)
  }
  return parsed
}

export async function claimArcAgreementActivationReconciliations(input: {
  workerId: string
  maxAttempts?: number
  leaseMs?: number
}, dependencies: Dependencies = defaults): Promise<ArcAgreementActivationReconciliationClaim[]> {
  if (!dependencies.hasStore()) return []
  const workerId = String(input.workerId ?? '').trim()
  if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(workerId)) {
    throw new Error('Arc Agreement reconciliation worker id is invalid.')
  }
  const maximum = boundedInteger(input.maxAttempts, 10, 1, 25)
  const leaseMs = boundedInteger(input.leaseMs, 30_000, 10_000, 120_000)
  const now = dependencies.now()
  const nowMs = now.getTime()
  const timestamp = now.toISOString()
  const claimed: ArcAgreementActivationReconciliationClaim[] = []

  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const jobs = store.reconciliationJobs!
    const attempts = Object.values(store.attempts)
    for (const attempt of attempts) {
      if (!reconciliationEligible(attempt)) delete jobs[attempt.id]
    }
    const eligible = attempts
      .filter(attempt => reconciliationEligible(attempt))
      .sort((a, b) => {
        const aJob = jobs[a.id]
        const bJob = jobs[b.id]
        if (Boolean(aJob?.lastAttemptAt) !== Boolean(bJob?.lastAttemptAt)) return aJob?.lastAttemptAt ? 1 : -1
        return (aJob?.nextAttemptAt ?? aJob?.lastAttemptAt ?? a.createdAt)
          .localeCompare(bJob?.nextAttemptAt ?? bJob?.lastAttemptAt ?? b.createdAt)
      })
    for (const attempt of eligible) {
      if (claimed.length >= maximum) break
      const existing = jobs[attempt.id]
      if (validFuture(existing?.leaseUntil, nowMs) || validFuture(existing?.nextAttemptAt, nowMs)) continue
      const attemptNumber = Math.max(0, existing?.attempts ?? 0) + 1
      const leaseToken = createHash('sha256')
        .update(`${workerId}\0${attempt.id}\0${timestamp}\0${attemptNumber}`)
        .digest('hex')
      jobs[attempt.id] = {
        attempts: attemptNumber,
        leaseToken,
        leaseUntil: new Date(nowMs + leaseMs).toISOString(),
        lastAttemptAt: timestamp,
        ...(existing?.lastError ? { lastError: existing.lastError } : {}),
      }
      claimed.push({
        attemptId: attempt.id,
        partnerId: attempt.partnerId,
        agreementId: attempt.agreementId,
        leaseToken,
      })
    }
    return store
  })
  return claimed
}

export async function completeArcAgreementActivationReconciliation(input: {
  attemptId: string
  leaseToken: string
  pending: boolean
  retryAfterMs?: number
}, dependencies: Dependencies = defaults) {
  if (!dependencies.hasStore()) return
  const retryAfterMs = boundedInteger(input.retryAfterMs, 10_000, 5_000, 300_000)
  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const job = store.reconciliationJobs?.[input.attemptId]
    if (!job || job.leaseToken !== input.leaseToken) return store
    const attempt = store.attempts[input.attemptId]
    if (!input.pending || !reconciliationEligible(attempt)) {
      delete store.reconciliationJobs![input.attemptId]
      return store
    }
    store.reconciliationJobs![input.attemptId] = {
      attempts: job.attempts,
      lastAttemptAt: job.lastAttemptAt,
      nextAttemptAt: new Date(dependencies.now().getTime() + retryAfterMs).toISOString(),
    }
    return store
  })
}

export async function failArcAgreementActivationReconciliation(input: {
  attemptId: string
  leaseToken: string
  error: unknown
}, dependencies: Dependencies = defaults) {
  if (!dependencies.hasStore()) return
  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const job = store.reconciliationJobs?.[input.attemptId]
    if (!job || job.leaseToken !== input.leaseToken) return store
    const attempt = store.attempts[input.attemptId]
    if (!reconciliationEligible(attempt)) {
      delete store.reconciliationJobs![input.attemptId]
      return store
    }
    const retryMs = Math.min(300_000, 5_000 * (2 ** Math.min(6, Math.max(0, job.attempts - 1))))
    const message = (input.error instanceof Error ? input.error.message : String(input.error))
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300)
    store.reconciliationJobs![input.attemptId] = {
      attempts: job.attempts,
      lastAttemptAt: job.lastAttemptAt,
      nextAttemptAt: new Date(dependencies.now().getTime() + retryMs).toISOString(),
      lastError: message || 'Arc Agreement reconciliation failed.',
    }
    return store
  })
}

export async function claimArcAgreementLifecycleReconciliations(input: {
  workerId: string
  maxAttempts?: number
  leaseMs?: number
}, dependencies: Dependencies = defaults): Promise<ArcAgreementLifecycleReconciliationClaim[]> {
  if (!dependencies.hasStore()) return []
  const workerId = String(input.workerId ?? '').trim()
  if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(workerId)) {
    throw new Error('Arc Agreement lifecycle worker id is invalid.')
  }
  const maximum = boundedInteger(input.maxAttempts, 10, 1, 25)
  const leaseMs = boundedInteger(input.leaseMs, 60_000, 10_000, 180_000)
  const now = dependencies.now()
  const nowMs = now.getTime()
  const timestamp = now.toISOString()
  const claimed: ArcAgreementLifecycleReconciliationClaim[] = []

  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const jobs = store.lifecycleJobs!
    const attempts = Object.values(store.attempts)
    for (const attempt of attempts) {
      if (!lifecycleReconciliationEligible(attempt)) delete jobs[attempt.id]
    }
    const eligible = attempts
      .filter(attempt => lifecycleReconciliationEligible(attempt))
      .sort((a, b) => {
        const aJob = jobs[a.id]
        const bJob = jobs[b.id]
        if (Boolean(aJob?.lastAttemptAt) !== Boolean(bJob?.lastAttemptAt)) return aJob?.lastAttemptAt ? 1 : -1
        return (aJob?.nextAttemptAt ?? aJob?.lastAttemptAt ?? a.createdAt)
          .localeCompare(bJob?.nextAttemptAt ?? bJob?.lastAttemptAt ?? b.createdAt)
      })
    for (const attempt of eligible) {
      if (claimed.length >= maximum) break
      const existing = jobs[attempt.id]
      if (validFuture(existing?.leaseUntil, nowMs) || validFuture(existing?.nextAttemptAt, nowMs)) continue
      const attemptNumber = Math.max(0, existing?.attempts ?? 0) + 1
      const leaseToken = createHash('sha256')
        .update(`${workerId}\0lifecycle\0${attempt.id}\0${timestamp}\0${attemptNumber}`)
        .digest('hex')
      jobs[attempt.id] = {
        attempts: attemptNumber,
        leaseToken,
        leaseUntil: new Date(nowMs + leaseMs).toISOString(),
        lastAttemptAt: timestamp,
        ...(existing?.lastError ? { lastError: existing.lastError } : {}),
      }
      claimed.push({
        attemptId: attempt.id,
        partnerId: attempt.partnerId,
        agreementId: attempt.agreementId,
        escrow: attempt.escrow!,
        prepared: hydratePrepared(attempt.prepared),
        ...(attempt.lifecycle?.eventId || attempt.activationWebhookEventId
          ? { lastEventId: attempt.lifecycle?.eventId ?? attempt.activationWebhookEventId }
          : {}),
        ...(attempt.lifecycle?.observedBlockNumber || attempt.observedBlockNumber
          ? { lastObservedBlockNumber: attempt.lifecycle?.observedBlockNumber ?? attempt.observedBlockNumber }
          : {}),
        ...(attempt.lifecycle ? {
          lastObservedBlockTimestamp: attempt.lifecycle.observedBlockTimestamp,
          lastStatus: attempt.lifecycle.status,
          lastNextStep: attempt.lifecycle.nextStep,
          lastReleasedAmountUsdcUnits: attempt.lifecycle.releasedAmountUsdcUnits,
        } : {}),
        leaseToken,
      })
    }
    return store
  })
  return claimed
}

export async function completeArcAgreementLifecycleReconciliation(input: {
  attemptId: string
  leaseToken: string
  observation: ArcAgreementLifecycleObservation
  pollAfterMs?: number
}, dependencies: Dependencies = defaults) {
  if (!dependencies.hasStore()) return
  const pollAfterMs = boundedInteger(input.pollAfterMs, 15_000, 5_000, 300_000)
  if (!/^evt_[a-z0-9]{12,64}$/i.test(input.observation.eventId)) {
    throw new Error('Arc Agreement lifecycle event id is invalid.')
  }
  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const job = store.lifecycleJobs?.[input.attemptId]
    if (!job || job.leaseToken !== input.leaseToken) return store
    const attempt = store.attempts[input.attemptId]
    if (!attempt || attempt.status !== 'active') {
      delete store.lifecycleJobs![input.attemptId]
      return store
    }
    const timestamp = dependencies.now().toISOString()
    store.attempts[input.attemptId] = {
      ...attempt,
      lifecycle: { ...input.observation },
      observedBlockNumber: input.observation.observedBlockNumber,
      updatedAt: timestamp,
    }
    if (['completed', 'cancelled', 'refunded'].includes(input.observation.status)) {
      delete store.lifecycleJobs![input.attemptId]
    } else {
      store.lifecycleJobs![input.attemptId] = {
        attempts: job.attempts,
        lastAttemptAt: job.lastAttemptAt,
        nextAttemptAt: new Date(dependencies.now().getTime() + pollAfterMs).toISOString(),
      }
    }
    return store
  })
}

export async function recordArcAgreementLifecycleObservation(
  partnerIdValue: string,
  agreementIdValue: string,
  observation: ArcAgreementLifecycleObservation,
  dependencies: Dependencies = defaults,
) {
  if (!dependencies.hasStore()) throw new Error('Arc Agreement activation storage is not configured.')
  const partnerId = String(partnerIdValue ?? '').trim()
  if (!/^dev_[a-z0-9]{8,64}$/i.test(partnerId)) throw new Error('Developer project id is invalid.')
  const agreementId = requireAgreementId(agreementIdValue)
  if (!['active', 'expired', 'completed', 'cancelled', 'refunded'].includes(observation.status)) {
    throw new Error('Arc Agreement lifecycle status is invalid.')
  }
  if (!/^evt_[a-z0-9]{12,64}$/i.test(observation.eventId)) {
    throw new Error('Arc Agreement lifecycle event id is invalid.')
  }
  for (const [label, value] of Object.entries({
    observedBlockNumber: observation.observedBlockNumber,
    releasedAmountUsdcUnits: observation.releasedAmountUsdcUnits,
    obligationAmountUsdcUnits: observation.obligationAmountUsdcUnits,
    excessAmountUsdcUnits: observation.excessAmountUsdcUnits,
  })) {
    if (!/^\d+$/.test(value)) throw new Error(`Arc Agreement lifecycle ${label} is invalid.`)
  }
  if (!Number.isInteger(observation.nextStep) || observation.nextStep < 0) {
    throw new Error('Arc Agreement lifecycle next step is invalid.')
  }
  if (!Number.isFinite(Date.parse(observation.observedBlockTimestamp)) || !Number.isFinite(Date.parse(observation.observedAt))) {
    throw new Error('Arc Agreement lifecycle observation time is invalid.')
  }
  let durable: ArcAgreementActivationAttempt | undefined
  let replayed = false
  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const attempt = requireProjectAttempt(store, { partnerId }, agreementId)
    if (attempt.status !== 'active') {
      throw new Error('Only an active Arc Agreement can record lifecycle state.')
    }
    const existing = attempt.lifecycle
    if (existing?.eventId === observation.eventId) {
      durable = attempt
      replayed = true
      return store
    }
    if (existing && ['completed', 'cancelled', 'refunded'].includes(existing.status)) {
      throw new Error('A terminal Arc Agreement lifecycle observation cannot be replaced.')
    }
    if (existing && BigInt(observation.observedBlockNumber) < BigInt(existing.observedBlockNumber)) {
      throw new Error('Arc Agreement lifecycle observation cannot move backwards.')
    }
    if (existing && BigInt(observation.releasedAmountUsdcUnits) < BigInt(existing.releasedAmountUsdcUnits)) {
      throw new Error('Arc Agreement released amount cannot decrease.')
    }
    durable = {
      ...attempt,
      lifecycle: { ...observation },
      observedBlockNumber: observation.observedBlockNumber,
      updatedAt: dependencies.now().toISOString(),
    }
    store.attempts[attempt.id] = durable
    if (['completed', 'cancelled', 'refunded'].includes(observation.status)) {
      delete store.lifecycleJobs?.[attempt.id]
    }
    return store
  })
  if (!durable) throw new Error('Arc Agreement lifecycle observation was not persisted.')
  return { attempt: durable, replayed }
}

export async function failArcAgreementLifecycleReconciliation(input: {
  attemptId: string
  leaseToken: string
  error: unknown
}, dependencies: Dependencies = defaults) {
  if (!dependencies.hasStore()) return
  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const job = store.lifecycleJobs?.[input.attemptId]
    if (!job || job.leaseToken !== input.leaseToken) return store
    const attempt = store.attempts[input.attemptId]
    if (!lifecycleReconciliationEligible(attempt)) {
      delete store.lifecycleJobs![input.attemptId]
      return store
    }
    const retryMs = Math.min(300_000, 5_000 * (2 ** Math.min(6, Math.max(0, job.attempts - 1))))
    const message = (input.error instanceof Error ? input.error.message : String(input.error))
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300)
    store.lifecycleJobs![input.attemptId] = {
      attempts: job.attempts,
      lastAttemptAt: job.lastAttemptAt,
      nextAttemptAt: new Date(dependencies.now().getTime() + retryMs).toISOString(),
      lastError: message || 'Arc Agreement lifecycle reconciliation failed.',
    }
    return store
  })
}

function requireAgreementId(value: string) {
  const normalized = String(value ?? '').trim()
  if (!AGREEMENT_ID.test(normalized)) throw new Error('A durable Arc Agreement id is required.')
  return normalized
}

function requireTransactionHash(value: string) {
  const normalized = String(value ?? '').trim()
  if (!TRANSACTION_HASH.test(normalized)) throw new Error('A valid Arc transaction hash is required.')
  return normalized.toLowerCase() as Hex
}

function requireProviderId(value: string, label: string) {
  const normalized = String(value ?? '').trim()
  if (!UUID.test(normalized)) throw new Error(`${label} is invalid.`)
  return normalized.toLowerCase()
}

function requireChallengeId(value: string) {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized.length > 256 || !/^[a-zA-Z0-9_-]+$/.test(normalized)) {
    throw new Error('Circle payer challenge id is invalid.')
  }
  return normalized
}

function confirmationBlocks(value: number | undefined) {
  const parsed = value ?? Number(process.env.ARC_AGREEMENT_CONFIRMATION_BLOCKS || 5)
  if (!Number.isInteger(parsed) || parsed < 5 || parsed > MAX_CONFIRMATIONS) {
    throw new Error(`Arc Agreement activation requires 5 to ${MAX_CONFIRMATIONS} confirmation blocks.`)
  }
  return parsed
}

function attemptId(partnerId: string, agreementId: string) {
  const digest = createHash('sha256')
    .update(`${partnerId.toLowerCase()}\0${agreementId.toLowerCase()}`)
    .digest('hex')
  return `aat_${digest.slice(0, 24)}`
}

export function arcAgreementPayerIdentityHash(identity: string) {
  const normalized = String(identity ?? '').trim()
  if (!/^[a-z]+:[^\s]{8,240}$/i.test(normalized)) {
    throw new Error('A namespaced authenticated payer identity is required.')
  }
  return createHash('sha256').update(normalized).digest('hex')
}

function serializePrepared(prepared: ArcAgreementPreparedDeployment): StoredPreparedDeployment {
  return {
    ...prepared,
    totalAmount: prepared.totalAmount.toString(),
    cancelUntil: prepared.cancelUntil.toString(),
    expiresAt: prepared.expiresAt.toString(),
    cumulativeReleaseBps: [...prepared.cumulativeReleaseBps],
  }
}

function hydratePrepared(prepared: StoredPreparedDeployment): ArcAgreementPreparedDeployment {
  return {
    ...prepared,
    totalAmount: BigInt(prepared.totalAmount),
    cancelUntil: BigInt(prepared.cancelUntil),
    expiresAt: BigInt(prepared.expiresAt),
    cumulativeReleaseBps: [...prepared.cumulativeReleaseBps],
  }
}

function payerCalls(prepared: ArcAgreementPreparedDeployment) {
  const approval: ArcAgreementPayerCall = Object.freeze({
    chainId: prepared.chainId,
    to: prepared.usdc,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [prepared.factory, prepared.totalAmount],
    }),
    value: '0',
  })
  const activation: ArcAgreementPayerCall = Object.freeze({
    chainId: prepared.chainId,
    to: prepared.factory,
    data: encodeFunctionData({
      abi: factoryAbi,
      functionName: 'createAndFund',
      args: [{
        clientReference: prepared.clientReference,
        termsHash: prepared.termsHash,
        recipient: prepared.recipient,
        template: prepared.templateCode,
        totalAmount: prepared.totalAmount,
        cancelUntil: prepared.cancelUntil,
        expiresAt: prepared.expiresAt,
        cumulativeReleaseBps: prepared.cumulativeReleaseBps,
      }],
    }),
    value: '0',
  })
  return Object.freeze({ approval, activation })
}

function publicAuthorization(authorization: ArcAgreementActivationAuthorization) {
  return {
    ...authorization,
    amountCeilingUsdcUnits: authorization.amountCeilingUsdcUnits.toString(),
    dailyVolumeCeilingUsdcUnits: authorization.dailyVolumeCeilingUsdcUnits.toString(),
  }
}

function activationDraft(attempt: ArcAgreementActivationAttempt): ArcAgreementDraftBinding {
  const prepared = hydratePrepared(attempt.prepared)
  const cancellationWindowSeconds = prepared.cancelUntil === 0n
    ? 0
    : Number(prepared.cancelUntil) - attempt.activationTimestamp
  const durationSeconds = Number(prepared.expiresAt) - attempt.activationTimestamp
  return {
    clientReference: prepared.clientReference,
    termsHash: prepared.termsHash,
    chainTerms: {
      templateCode: prepared.templateCode,
      amountUsdcUnits: prepared.totalAmount.toString(),
      recipient: prepared.recipient,
      cumulativeReleaseBps: [...prepared.cumulativeReleaseBps],
      durationSeconds,
      cancellationWindowSeconds,
    },
  }
}

function authorizedAttemptAt(
  attempt: ArcAgreementActivationAttempt,
  policy: DeveloperCheckoutPolicy,
  activationTimestamp: number,
  env: NodeJS.ProcessEnv,
) {
  return authorizeArcAgreementActivation({
    policy,
    draft: activationDraft(attempt),
    payer: attempt.prepared.payer,
    activationTimestamp,
    env,
  })
}

function reauthorizeAttempt(
  attempt: ArcAgreementActivationAttempt,
  policy: DeveloperCheckoutPolicy,
  env: NodeJS.ProcessEnv,
) {
  const authorized = authorizedAttemptAt(
    attempt,
    policy,
    attempt.activationTimestamp,
    env,
  )
  if (authorized.prepared.deploymentHash !== attempt.prepared.deploymentHash) {
    throw new Error('The durable Arc Agreement commitment no longer matches the activation policy.')
  }
  return authorized.authorization
}

function renewActivationCommitment(
  attempt: ArcAgreementActivationAttempt,
  policy: DeveloperCheckoutPolicy,
  activationTimestamp: number,
  env: NodeJS.ProcessEnv,
  updatedAt: string,
) {
  const authorized = authorizedAttemptAt(attempt, policy, activationTimestamp, env)
  const prepared = serializePrepared(authorized.prepared)
  const calls = payerCalls(authorized.prepared)
  if (
    calls.approval.to !== attempt.calls.approval.to
    || calls.approval.data !== attempt.calls.approval.data
  ) {
    throw new Error('Renewing activation timestamps changed the approved payer authorization.')
  }
  return {
    ...attempt,
    activationTimestamp,
    authorization: publicAuthorization(authorized.authorization),
    prepared,
    calls,
    updatedAt,
  }
}

function activationTransactionCountsForVolume(transaction: ArcAgreementPayerTransaction) {
  return transaction.stage === 'activation' && transaction.failure !== 'transaction_reverted'
}

function attemptCountsAsActive(attempt: ArcAgreementActivationAttempt) {
  if (attempt.status === 'activation_submitted' || attempt.status === 'reconciliation_failed') return true
  if (attempt.status !== 'active') return false
  return !['completed', 'cancelled', 'refunded'].includes(attempt.lifecycle?.status ?? '')
}

export function arcAgreementProjectCapacitySnapshot(input: {
  attempts: Iterable<ArcAgreementActivationAttempt>
  partnerId: string
  utcDay: string
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.utcDay)) throw new Error('Arc Agreement capacity day is invalid.')
  let activeAgreements = 0
  let dailyVolumeUsdcUnits = 0n
  for (const attempt of input.attempts) {
    if (attempt.partnerId !== input.partnerId) continue
    const activationTransactions = attempt.transactions.filter(activationTransactionCountsForVolume)
    const reserved = Boolean(attempt.capacityReservation && activationTransactions.length === 0)
    if (attemptCountsAsActive(attempt) || reserved) activeAgreements += 1
    for (const transaction of activationTransactions) {
      if (transaction.submittedAt.slice(0, 10) === input.utcDay) {
        dailyVolumeUsdcUnits += BigInt(attempt.prepared.totalAmount)
      }
    }
    if (reserved && attempt.capacityReservation!.utcDay === input.utcDay) {
      dailyVolumeUsdcUnits += BigInt(attempt.capacityReservation!.amountUsdcUnits)
    }
  }
  return { activeAgreements, dailyVolumeUsdcUnits }
}

function assertArcAgreementProjectCapacity(input: {
  store: ArcAgreementActivationStore
  attempt: ArcAgreementActivationAttempt
  authorization: ArcAgreementActivationAuthorization
  timestamp: string
  excludeAttemptId?: string
}) {
  const capacity = arcAgreementProjectCapacitySnapshot({
    attempts: Object.values(input.store.attempts)
      .filter(attempt => attempt.id !== input.excludeAttemptId),
    partnerId: input.attempt.partnerId,
    utcDay: input.timestamp.slice(0, 10),
  })
  if (capacity.activeAgreements >= input.authorization.activeAgreementLimit) {
    throw new Error('This developer project has reached its active Arc Agreement limit.')
  }
  const amount = BigInt(input.attempt.prepared.totalAmount)
  if (capacity.dailyVolumeUsdcUnits + amount > input.authorization.dailyVolumeCeilingUsdcUnits) {
    throw new Error('This developer project has reached its Arc Agreement daily-volume limit.')
  }
  return capacity
}

function requireProjectAttempt(
  store: ArcAgreementActivationStore,
  policy: Pick<DeveloperCheckoutPolicy, 'partnerId'>,
  agreementId: string,
) {
  const id = attemptId(policy.partnerId, agreementId)
  const attempt = store.attempts[id]
  if (!attempt || attempt.partnerId !== policy.partnerId || attempt.agreementId !== agreementId) {
    throw new Error('Arc Agreement activation attempt was not found for this project.')
  }
  return attempt
}

function expectedCall(attempt: ArcAgreementActivationAttempt, stage: 'approval' | 'activation') {
  return attempt.calls[stage]
}

function isExactCircleUserOperation(
  transaction: TransactionObservation,
  payer: Address,
  directCall: ArcAgreementPayerCall,
  smartWallet: ArcAgreementPayerCall,
) {
  if (transaction.to === null || getAddress(transaction.to) !== ENTRY_POINT_V06) return false
  try {
    const entryPointCall = decodeFunctionData({
      abi: entryPointV06Abi,
      data: transaction.input,
    })
    if (entryPointCall.functionName !== 'handleOps') return false
    const [operations] = entryPointCall.args
    if (operations.length !== 1) return false
    const operation = operations[0]
    if (getAddress(operation.sender) !== payer) return false
    const accountCall = decodeFunctionData({
      abi: circleAccountAbi,
      data: operation.callData,
    })
    if (accountCall.functionName !== 'execute') return false
    const [destination, value, callData] = accountCall.args
    return (
      value === 0n
      && (
        (
          getAddress(destination) === directCall.to
          && callData.toLowerCase() === directCall.data.toLowerCase()
        )
        || (
          getAddress(destination) === payer
          && callData.toLowerCase() === smartWallet.data.toLowerCase()
        )
      )
    )
  } catch {
    return false
  }
}

function observedCircleSmartWalletCall(
  transaction: TransactionObservation,
  payer: Address,
) {
  if (transaction.to !== null && getAddress(transaction.to) === payer) {
    return {
      data: transaction.input,
      execution: 'circle_smart_wallet' as const,
    }
  }
  if (transaction.to === null || getAddress(transaction.to) !== ENTRY_POINT_V06) return null
  try {
    const entryPointCall = decodeFunctionData({
      abi: entryPointV06Abi,
      data: transaction.input,
    })
    if (entryPointCall.functionName !== 'handleOps') return null
    const [operations] = entryPointCall.args
    if (operations.length !== 1) return null
    const operation = operations[0]
    if (getAddress(operation.sender) !== payer) return null
    const accountCall = decodeFunctionData({
      abi: circleAccountAbi,
      data: operation.callData,
    })
    if (accountCall.functionName !== 'execute') return null
    const [destination, value, callData] = accountCall.args
    if (value !== 0n) return null
    return {
      data: callData,
      target: getAddress(destination),
      execution: 'circle_user_operation' as const,
    }
  } catch {
    return null
  }
}

function recoverActivationCommitment(
  transaction: TransactionObservation,
  attempt: ArcAgreementActivationAttempt,
) {
  const observed = observedCircleSmartWalletCall(transaction, attempt.prepared.payer)
  if (!observed) return null
  try {
    const prepared = hydratePrepared(attempt.prepared)
    let factoryCallData: Hex
    if ('target' in observed && observed.target !== prepared.payer) {
      if (observed.target !== prepared.factory) return null
      factoryCallData = observed.data
    } else {
      const smartWalletCall = decodeFunctionData({
        abi: smartWalletAbi,
        data: observed.data,
      })
      if (smartWalletCall.functionName !== 'executeBatch') return null
      const [calls] = smartWalletCall.args
      if (calls.length !== 1) return null
      const call = calls[0]
      if (getAddress(call.target) !== prepared.factory || call.value !== 0n) return null
      factoryCallData = call.data
    }
    const factoryCall = decodeFunctionData({
      abi: factoryAbi,
      data: factoryCallData,
    })
    if (factoryCall.functionName !== 'createAndFund') return null
    const [params] = factoryCall.args
    const draft = activationDraft(attempt)
    const activationTimestamp = Number(params.expiresAt) - draft.chainTerms.durationSeconds
    if (!Number.isSafeInteger(activationTimestamp) || activationTimestamp <= 0) return null
    const recoveredPrepared = prepareArcAgreementDeployment({
      draft,
      payer: prepared.payer,
      factory: prepared.factory,
      operator: prepared.operator,
      usdc: prepared.usdc,
      activationTimestamp,
    })
    const recoveredAttempt: ArcAgreementActivationAttempt = {
      ...attempt,
      activationTimestamp,
      prepared: serializePrepared(recoveredPrepared),
      calls: payerCalls(recoveredPrepared),
    }
    const expectedDirect = expectedCall(recoveredAttempt, 'activation')
    if ('target' in observed && observed.target !== prepared.payer) {
      if (
        observed.target !== expectedDirect.to
        || observed.data.toLowerCase() !== expectedDirect.data.toLowerCase()
      ) return null
    } else {
      const expectedWrapped = arcAgreementCircleSmartWalletCall(recoveredAttempt, 'activation')
      if (expectedWrapped.data.toLowerCase() !== observed.data.toLowerCase()) return null
    }
    return { attempt: recoveredAttempt, execution: observed.execution }
  } catch {
    return null
  }
}

export function arcAgreementCircleSmartWalletCall(
  attempt: ArcAgreementActivationAttempt,
  stage: 'approval' | 'activation',
): ArcAgreementPayerCall {
  const expected = expectedCall(attempt, stage)
  return Object.freeze({
    chainId: expected.chainId,
    to: attempt.prepared.payer,
    data: encodeFunctionData({
      abi: smartWalletAbi,
      functionName: 'executeBatch',
      args: [[{
        target: expected.to,
        value: 0n,
        data: expected.data,
      }]],
    }),
    value: '0',
  })
}

async function verifiedPayerTransaction(input: {
  client: ArcAgreementActivationClient
  attempt: ArcAgreementActivationAttempt
  stage: 'approval' | 'activation'
  transactionHash: Hex
  recoverSubmittedChallenge?: boolean
}) {
  if (await input.client.getChainId() !== 5_042_002) throw new Error('Payer transaction is not on Arc Testnet.')
  const transaction = await input.client.getTransaction({ hash: input.transactionHash })
  const expected = expectedCall(input.attempt, input.stage)
  if (transaction.hash.toLowerCase() !== input.transactionHash) {
    throw new Error('Arc RPC returned a different payer transaction hash.')
  }
  if (transaction.value !== 0n) throw new Error('Arc Agreement payer calls must not transfer native value.')
  const direct = (
    getAddress(transaction.from) === input.attempt.prepared.payer
    && transaction.to !== null
    && getAddress(transaction.to) === expected.to
    && transaction.input.toLowerCase() === expected.data.toLowerCase()
  )
  if (direct) return { transaction, execution: 'direct' as const }

  const smartWallet = arcAgreementCircleSmartWalletCall(input.attempt, input.stage)
  const wrapped = (
    transaction.to !== null
    && getAddress(transaction.to) === smartWallet.to
    && transaction.input.toLowerCase() === smartWallet.data.toLowerCase()
  )
  if (wrapped) return { transaction, execution: 'circle_smart_wallet' as const }
  if (isExactCircleUserOperation(transaction, input.attempt.prepared.payer, expected, smartWallet)) {
    return { transaction, execution: 'circle_user_operation' as const }
  }
  if (input.stage === 'activation' && input.recoverSubmittedChallenge) {
    const recovered = recoverActivationCommitment(transaction, input.attempt)
    if (recovered) {
      return {
        transaction,
        execution: recovered.execution,
        recoveredAttempt: recovered.attempt,
      }
    }
  }
  throw new Error('Payer transaction does not match the prepared direct, Circle smart-wallet, or Circle user-operation call.')
}

function transactionForStage(
  attempt: ArcAgreementActivationAttempt,
  stage: 'approval' | 'activation',
) {
  return [...attempt.transactions].reverse().find(item => item.stage === stage)
}

function challenges(attempt: ArcAgreementActivationAttempt) {
  return [...(attempt.challenges ?? [])]
}

function agentCallPreparations(attempt: ArcAgreementActivationAttempt) {
  return [...(attempt.agentCallPreparations ?? [])]
}

function latestAgentCallPreparation(
  attempt: ArcAgreementActivationAttempt,
  stage: 'approval' | 'activation',
) {
  return agentCallPreparations(attempt)
    .filter(item => item.stage === stage)
    .sort((left, right) => right.sequence - left.sequence)[0]
}

function challengeIdempotencyKey(
  attempt: ArcAgreementActivationAttempt,
  stage: 'approval' | 'activation',
  sequence: number,
) {
  const bytes = Buffer.from(createHash('sha256').update(`${attempt.id}\0${stage}\0${sequence}`).digest())
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function currentChallenge(
  attempt: ArcAgreementActivationAttempt,
  stage: 'approval' | 'activation',
) {
  return challenges(attempt)
    .filter(item => item.stage === stage)
    .sort((a, b) => b.sequence - a.sequence)[0]
}

function confirmedDepth(head: bigint, receiptBlock: bigint, confirmations: number) {
  return head >= receiptBlock + BigInt(confirmations)
}

function replaceTransaction(
  transactions: ArcAgreementPayerTransaction[],
  hash: Hex,
  update: (current: ArcAgreementPayerTransaction) => ArcAgreementPayerTransaction,
) {
  return transactions.map(item => item.hash === hash ? update(item) : item)
}

export async function prepareArcAgreementActivationAttempt(input: {
  policy: DeveloperCheckoutPolicy
  agreementId: string
  draft: ArcAgreementDraftBinding
  payer: string
  payerIdentity: string
  env?: NodeJS.ProcessEnv
}, dependencies: Dependencies = defaults) {
  if (!dependencies.hasStore()) throw new Error('Arc Agreement activation storage is not configured.')
  const agreementId = requireAgreementId(input.agreementId)
  const id = attemptId(input.policy.partnerId, agreementId)
  const now = dependencies.now()
  const timestamp = now.toISOString()
  const existing = (await dependencies.read(STORE_KEY))?.attempts?.[id]
  const activationTimestamp = existing?.activationTimestamp ?? Math.floor(now.getTime() / 1_000)
  const payerIdentityHash = arcAgreementPayerIdentityHash(input.payerIdentity)
  const authorized = authorizeArcAgreementActivation({
    policy: input.policy,
    draft: input.draft,
    payer: input.payer,
    activationTimestamp,
    env: input.env,
  })
  const prepared = serializePrepared(authorized.prepared)
  let replayed = false
  let durableAttempt: ArcAgreementActivationAttempt | undefined

  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const existing = store.attempts[id]
    if (existing) {
      if (
        existing.partnerId !== input.policy.partnerId
        || existing.agreementId !== agreementId
        || existing.payerIdentityHash !== payerIdentityHash
        || existing.prepared.payer !== prepared.payer
        || existing.prepared.deploymentHash !== prepared.deploymentHash
      ) {
        throw new Error('Arc Agreement already has a different durable activation commitment.')
      }
      replayed = true
      durableAttempt = existing
      return store
    }
    durableAttempt = {
      id,
      partnerId: input.policy.partnerId,
      agreementId,
      payerIdentityHash,
      checkoutMode: input.policy.checkoutMode,
      status: 'awaiting_approval',
      authorization: publicAuthorization(authorized.authorization),
      prepared,
      calls: payerCalls(authorized.prepared),
      transactions: [],
      challenges: [],
      activationTimestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    store.attempts[id] = durableAttempt
    return store
  })
  if (!durableAttempt) throw new Error('Arc Agreement activation attempt could not be persisted.')
  return { attempt: durableAttempt, replayed }
}

export async function readArcAgreementActivationAttempt(
  policy: DeveloperCheckoutPolicy,
  agreementIdValue: string,
  dependencies: Dependencies = defaults,
) {
  if (!dependencies.hasStore()) throw new Error('Arc Agreement activation storage is not configured.')
  const agreementId = requireAgreementId(agreementIdValue)
  const store = await dependencies.read(STORE_KEY)
  if (!store) throw new Error('Arc Agreement activation attempt was not found for this project.')
  return requireProjectAttempt(store, policy, agreementId)
}

export async function readArcAgreementActivationBinding(
  partnerIdValue: string,
  agreementIdValue: string,
  dependencies: Dependencies = defaults,
) {
  const attempt = await readArcAgreementActivationAttemptRecord(
    partnerIdValue,
    agreementIdValue,
    dependencies,
  )
  if (attempt.status !== 'active' || !attempt.escrow) {
    throw new Error('Arc Agreement lifecycle actions require a durably active escrow.')
  }
  return {
    attemptId: attempt.id,
    partnerId: attempt.partnerId,
    agreementId: attempt.agreementId,
    payerIdentityHash: attempt.payerIdentityHash,
    checkoutMode: attempt.checkoutMode,
    escrow: attempt.escrow,
    prepared: hydratePrepared(attempt.prepared),
    lifecycle: attempt.lifecycle ? { ...attempt.lifecycle } : undefined,
  }
}

export async function readArcAgreementActivationAttemptRecord(
  partnerIdValue: string,
  agreementIdValue: string,
  dependencies: Dependencies = defaults,
) {
  if (!dependencies.hasStore()) throw new Error('Arc Agreement activation storage is not configured.')
  const partnerId = String(partnerIdValue ?? '').trim()
  if (!/^dev_[a-z0-9]{8,64}$/i.test(partnerId)) throw new Error('Developer project id is invalid.')
  const agreementId = requireAgreementId(agreementIdValue)
  const store = await dependencies.read(STORE_KEY)
  const attempt = store?.attempts?.[attemptId(partnerId, agreementId)]
  if (!attempt || attempt.partnerId !== partnerId || attempt.agreementId !== agreementId) {
    throw new Error('Arc Agreement activation attempt was not found for this project.')
  }
  return attempt
}

export async function listArcAgreementActivationAttemptRecords(
  input: { partnerId?: string; limit?: number } = {},
  dependencies: Dependencies = defaults,
) {
  if (!dependencies.hasStore()) return []
  const partnerId = String(input.partnerId ?? '').trim()
  if (partnerId && !/^dev_[a-z0-9]{8,64}$/i.test(partnerId)) {
    throw new Error('Developer project id is invalid.')
  }
  const limit = Math.min(250, Math.max(1, Math.trunc(input.limit ?? 100)))
  const store = await dependencies.read(STORE_KEY)
  return Object.values(store?.attempts ?? {})
    .filter(attempt => !partnerId || attempt.partnerId === partnerId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit)
}

export async function prepareArcAgreementPayerChallenge(input: {
  policy: DeveloperCheckoutPolicy
  agreementId: string
  payerIdentity: string
  stage: 'approval' | 'activation'
  env?: NodeJS.ProcessEnv
}, dependencies: Dependencies = defaults) {
  const attempt = await readArcAgreementActivationAttempt(
    input.policy,
    input.agreementId,
    dependencies,
  )
  if (attempt.payerIdentityHash !== arcAgreementPayerIdentityHash(input.payerIdentity)) {
    throw new Error('This Arc Agreement is bound to another authenticated payer.')
  }
  reauthorizeAttempt(attempt, input.policy, input.env ?? process.env)
  if (input.stage === 'approval' && attempt.status !== 'awaiting_approval' && attempt.status !== 'approval_failed') {
    throw new Error('The approval challenge is not expected in the current activation state.')
  }
  if (input.stage === 'activation' && attempt.status !== 'ready_to_activate' && attempt.status !== 'activation_failed') {
    throw new Error('The activation challenge requires confirmed payer approval.')
  }
  return {
    attempt,
    call: arcAgreementCircleSmartWalletCall(attempt, input.stage),
    priorStageTransactions: attempt.transactions.filter(item => item.stage === input.stage).length,
  }
}

export async function prepareArcAgreementAgentPayerCall(input: {
  policy: DeveloperCheckoutPolicy
  agreementId: string
  payer: string
  payerIdentity: string
  stage: 'approval' | 'activation'
  env?: NodeJS.ProcessEnv
}, dependencies: Dependencies = defaults) {
  if (!dependencies.hasStore()) throw new Error('Arc Agreement activation storage is not configured.')
  if (input.policy.checkoutMode !== 'agentic') {
    throw new Error('Direct agent payer calls require an agentic developer project.')
  }
  const agreementId = requireAgreementId(input.agreementId)
  if (!isAddress(input.payer)) throw new Error('A valid Arc payer address is required.')
  const payer = getAddress(input.payer)
  const payerIdentityHash = arcAgreementPayerIdentityHash(input.payerIdentity)
  const timestamp = dependencies.now().toISOString()
  let durableAttempt: ArcAgreementActivationAttempt | undefined
  let preparation: ArcAgreementAgentCallPreparation | undefined
  let replayed = false

  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const attempt = requireProjectAttempt(store, input.policy, agreementId)
    if (
      attempt.checkoutMode !== 'agentic'
      || attempt.payerIdentityHash !== payerIdentityHash
      || attempt.prepared.payer !== payer
    ) {
      throw new Error('This Arc Agreement is bound to another authenticated agent payer.')
    }
    if (input.stage === 'approval' && attempt.status !== 'awaiting_approval' && attempt.status !== 'approval_failed') {
      throw new Error('The approval transaction is not expected in the current activation state.')
    }
    if (input.stage === 'activation' && attempt.status !== 'ready_to_activate' && attempt.status !== 'activation_failed') {
      throw new Error('The activation transaction requires confirmed payer approval.')
    }

    const latest = latestAgentCallPreparation(attempt, input.stage)
    const canReplay = Boolean(
      latest
      && latest.deploymentHash === attempt.prepared.deploymentHash
      && (
        (input.stage === 'approval' && attempt.status === 'awaiting_approval')
        || (input.stage === 'activation' && attempt.status === 'ready_to_activate')
      ),
    )
    if (canReplay && latest) {
      reauthorizeAttempt(attempt, input.policy, input.env ?? process.env)
      durableAttempt = attempt
      preparation = latest
      replayed = true
      return store
    }

    const workingAttempt = input.stage === 'activation'
      ? renewActivationCommitment(
          attempt,
          input.policy,
          Math.floor(dependencies.now().getTime() / 1_000),
          input.env ?? process.env,
          timestamp,
        )
      : attempt
    const authorization = reauthorizeAttempt(workingAttempt, input.policy, input.env ?? process.env)
    let capacityAttempt = workingAttempt
    if (input.stage === 'activation' && !workingAttempt.capacityReservation) {
      assertArcAgreementProjectCapacity({
        store,
        attempt: workingAttempt,
        authorization,
        timestamp,
        excludeAttemptId: workingAttempt.id,
      })
      capacityAttempt = {
        ...workingAttempt,
        capacityReservation: {
          utcDay: timestamp.slice(0, 10),
          amountUsdcUnits: workingAttempt.prepared.totalAmount,
          reservedAt: timestamp,
        },
      }
    }
    const nextPreparation: ArcAgreementAgentCallPreparation = {
      stage: input.stage,
      sequence: (latest?.sequence ?? -1) + 1,
      deploymentHash: capacityAttempt.prepared.deploymentHash,
      preparedAt: timestamp,
    }
    preparation = nextPreparation
    durableAttempt = {
      ...capacityAttempt,
      agentCallPreparations: [...agentCallPreparations(capacityAttempt), nextPreparation],
      updatedAt: timestamp,
    }
    store.attempts[attempt.id] = durableAttempt
    return store
  })
  if (!durableAttempt || !preparation) throw new Error('Agent payer call preparation was not persisted.')
  return {
    attempt: durableAttempt,
    preparation,
    call: expectedCall(durableAttempt, input.stage),
    replayed,
  }
}

export async function reserveArcAgreementPayerChallenge(input: {
  policy: DeveloperCheckoutPolicy
  agreementId: string
  payerIdentity: string
  stage: 'approval' | 'activation'
  walletId: string
  walletAddress: string
  env?: NodeJS.ProcessEnv
}, dependencies: Dependencies = defaults) {
  if (!dependencies.hasStore()) throw new Error('Arc Agreement activation storage is not configured.')
  const agreementId = requireAgreementId(input.agreementId)
  const walletId = String(input.walletId ?? '').trim()
  if (!walletId || walletId.length > 256 || !isAddress(input.walletAddress)) {
    throw new Error('A valid linked Circle Arc wallet is required.')
  }
  const walletAddress = getAddress(input.walletAddress)
  const identityHash = arcAgreementPayerIdentityHash(input.payerIdentity)
  const timestamp = dependencies.now().toISOString()
  let durableAttempt: ArcAgreementActivationAttempt | undefined
  let durableChallenge: ArcAgreementPayerChallenge | undefined
  let replayed = false

  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const attempt = requireProjectAttempt(store, input.policy, agreementId)
    if (attempt.payerIdentityHash !== identityHash || attempt.prepared.payer !== walletAddress) {
      throw new Error('This Arc Agreement is bound to another authenticated payer wallet.')
    }
    if (input.stage === 'approval' && attempt.status !== 'awaiting_approval' && attempt.status !== 'approval_failed') {
      throw new Error('The approval challenge is not expected in the current activation state.')
    }
    if (input.stage === 'activation' && attempt.status !== 'ready_to_activate' && attempt.status !== 'activation_failed') {
      throw new Error('The activation challenge requires confirmed payer approval.')
    }
    const latest = currentChallenge(attempt, input.stage)
    if (latest?.status === 'manual_review') {
      throw new Error('The existing Circle payer challenge requires support review.')
    }
    if (
      input.stage === 'activation'
      && latest?.status === 'provider_failed'
      && latest.transactionHash
    ) {
      throw new Error('The existing Circle activation transaction requires recovery before retry.')
    }
    if (latest && !['provider_failed', 'recorded'].includes(latest.status)) {
      reauthorizeAttempt(attempt, input.policy, input.env ?? process.env)
      if (latest.walletId !== walletId || latest.walletAddress !== walletAddress) {
        throw new Error('The durable Circle challenge belongs to another payer wallet.')
      }
      replayed = true
      durableAttempt = attempt
      durableChallenge = latest
      return store
    }
    const workingAttempt = input.stage === 'activation'
      ? renewActivationCommitment(
          attempt,
          input.policy,
          Math.floor(dependencies.now().getTime() / 1_000),
          input.env ?? process.env,
          timestamp,
        )
      : attempt
    const authorization = reauthorizeAttempt(
      workingAttempt,
      input.policy,
      input.env ?? process.env,
    )
    if (workingAttempt !== attempt) store.attempts[workingAttempt.id] = workingAttempt
    let capacityAttempt = workingAttempt
    if (input.stage === 'activation' && !workingAttempt.capacityReservation) {
      assertArcAgreementProjectCapacity({
        store,
        attempt: workingAttempt,
        authorization,
        timestamp,
        excludeAttemptId: workingAttempt.id,
      })
      capacityAttempt = {
        ...workingAttempt,
        capacityReservation: {
          utcDay: timestamp.slice(0, 10),
          amountUsdcUnits: workingAttempt.prepared.totalAmount,
          reservedAt: timestamp,
        },
        updatedAt: timestamp,
      }
      store.attempts[workingAttempt.id] = capacityAttempt
    }
    const sequence = (latest?.sequence ?? -1) + 1
    const challenge: ArcAgreementPayerChallenge = {
      idempotencyKey: challengeIdempotencyKey(capacityAttempt, input.stage, sequence),
      stage: input.stage,
      sequence,
      status: 'reserved',
      walletId,
      walletAddress,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    durableChallenge = challenge
    durableAttempt = {
      ...capacityAttempt,
      challenges: [...challenges(capacityAttempt), challenge],
      updatedAt: timestamp,
    }
    store.attempts[attempt.id] = durableAttempt
    return store
  })
  if (!durableAttempt || !durableChallenge) throw new Error('Circle payer challenge reservation was not persisted.')
  return { attempt: durableAttempt, challenge: durableChallenge, replayed }
}

export async function attachArcAgreementPayerChallenge(input: {
  policy: DeveloperCheckoutPolicy
  agreementId: string
  payerIdentity: string
  idempotencyKey: string
  challengeId: string
  providerTransactionId?: string
}, dependencies: Dependencies = defaults) {
  const agreementId = requireAgreementId(input.agreementId)
  const identityHash = arcAgreementPayerIdentityHash(input.payerIdentity)
  const challengeId = requireChallengeId(input.challengeId)
  const providerTransactionId = input.providerTransactionId
    ? requireProviderId(input.providerTransactionId, 'Circle payer transaction id')
    : undefined
  const timestamp = dependencies.now().toISOString()
  let durableAttempt: ArcAgreementActivationAttempt | undefined
  let durableChallenge: ArcAgreementPayerChallenge | undefined
  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const attempt = requireProjectAttempt(store, input.policy, agreementId)
    if (attempt.payerIdentityHash !== identityHash) {
      throw new Error('This Arc Agreement is bound to another authenticated payer.')
    }
    const challengeList = challenges(attempt)
    const index = challengeList.findIndex(item => item.idempotencyKey === input.idempotencyKey)
    if (index < 0) throw new Error('Circle payer challenge reservation was not found.')
    const existing = challengeList[index]
    if (existing.challengeId && existing.challengeId !== challengeId) {
      throw new Error('Circle returned a different challenge for the same idempotency key.')
    }
    if (
      existing.providerTransactionId
      && providerTransactionId
      && existing.providerTransactionId !== providerTransactionId
    ) {
      throw new Error('Circle returned a different transaction for the same payer challenge.')
    }
    const next: ArcAgreementPayerChallenge = {
      ...existing,
      status: providerTransactionId ? 'transaction_pending' : 'issued',
      challengeId,
      ...(providerTransactionId ? { providerTransactionId } : {}),
      updatedAt: timestamp,
    }
    challengeList[index] = next
    durableChallenge = next
    durableAttempt = { ...attempt, challenges: challengeList, updatedAt: timestamp }
    store.attempts[attempt.id] = durableAttempt
    return store
  })
  if (!durableAttempt || !durableChallenge) throw new Error('Circle payer challenge was not persisted.')
  return { attempt: durableAttempt, challenge: durableChallenge }
}

export async function observeArcAgreementPayerChallenge(input: {
  policy: Pick<DeveloperCheckoutPolicy, 'partnerId'>
  agreementId: string
  payerIdentity: string
  stage: 'approval' | 'activation'
  challengeId: string
  providerTransactionId?: string
  transactionHash?: string
  providerState?: string
  status: 'issued' | 'transaction_pending' | 'provider_failed' | 'manual_review'
}, dependencies: Dependencies = defaults) {
  const agreementId = requireAgreementId(input.agreementId)
  const identityHash = arcAgreementPayerIdentityHash(input.payerIdentity)
  const challengeId = requireChallengeId(input.challengeId)
  const providerTransactionId = input.providerTransactionId
    ? requireProviderId(input.providerTransactionId, 'Circle payer transaction id')
    : undefined
  const transactionHash = input.transactionHash
    ? requireTransactionHash(input.transactionHash)
    : undefined
  const providerState = String(input.providerState ?? '').trim().toUpperCase().slice(0, 40)
  const timestamp = dependencies.now().toISOString()
  let durableChallenge: ArcAgreementPayerChallenge | undefined
  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const attempt = requireProjectAttempt(store, input.policy, agreementId)
    if (attempt.payerIdentityHash !== identityHash) {
      throw new Error('This Arc Agreement is bound to another authenticated payer.')
    }
    const challengeList = challenges(attempt)
    const index = challengeList.findIndex(item => item.stage === input.stage && item.challengeId === challengeId)
    if (index < 0) throw new Error('Durable Circle payer challenge was not found.')
    const existing = challengeList[index]
    if (
      existing.providerTransactionId
      && providerTransactionId
      && existing.providerTransactionId !== providerTransactionId
    ) {
      throw new Error('Circle payer challenge transaction identity changed.')
    }
    if (existing.transactionHash && transactionHash && existing.transactionHash !== transactionHash) {
      throw new Error('Circle payer challenge transaction hash changed.')
    }
    durableChallenge = {
      ...existing,
      status: input.status,
      ...(providerTransactionId ? { providerTransactionId } : {}),
      ...(transactionHash ? { transactionHash } : {}),
      ...(providerState ? { providerState } : {}),
      updatedAt: timestamp,
    }
    challengeList[index] = durableChallenge
    const definitivelyUnsubmittedActivation = (
      input.stage === 'activation'
      && input.status === 'provider_failed'
      && !existing.providerTransactionId
      && !providerTransactionId
      && !existing.transactionHash
      && !transactionHash
    )
    const {
      capacityReservation: _capacityReservation,
      ...attemptWithoutCapacityReservation
    } = attempt
    store.attempts[attempt.id] = {
      ...(definitivelyUnsubmittedActivation ? attemptWithoutCapacityReservation : attempt),
      challenges: challengeList,
      updatedAt: timestamp,
    }
    return store
  })
  if (!durableChallenge) throw new Error('Circle payer challenge observation was not persisted.')
  return durableChallenge
}

export async function markArcAgreementPayerChallengeRecorded(input: {
  policy: Pick<DeveloperCheckoutPolicy, 'partnerId'>
  agreementId: string
  payerIdentity: string
  stage: 'approval' | 'activation'
  challengeId: string
  transactionHash: string
}, dependencies: Dependencies = defaults) {
  const observed = await observeArcAgreementPayerChallenge({
    ...input,
    status: 'transaction_pending',
  }, dependencies)
  const timestamp = dependencies.now().toISOString()
  let durableChallenge: ArcAgreementPayerChallenge | undefined
  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const attempt = requireProjectAttempt(store, input.policy, requireAgreementId(input.agreementId))
    const challengeList = challenges(attempt)
    const index = challengeList.findIndex(item => item.challengeId === observed.challengeId)
    if (index < 0) throw new Error('Durable Circle payer challenge was not found.')
    durableChallenge = { ...challengeList[index], status: 'recorded', updatedAt: timestamp }
    challengeList[index] = durableChallenge
    store.attempts[attempt.id] = { ...attempt, challenges: challengeList, updatedAt: timestamp }
    return store
  })
  if (!durableChallenge) throw new Error('Circle payer challenge completion was not persisted.')
  return durableChallenge
}

export function latestArcAgreementPayerChallenge(
  attempt: ArcAgreementActivationAttempt,
  stage: 'approval' | 'activation',
) {
  return currentChallenge(attempt, stage) ?? null
}

export async function recordArcAgreementPayerTransaction(input: {
  client: ArcAgreementActivationClient
  policy: DeveloperCheckoutPolicy | Pick<DeveloperCheckoutPolicy, 'partnerId'>
  agreementId: string
  payer: string
  stage: 'approval' | 'activation'
  transactionHash: string
  recoverSubmittedChallenge?: boolean
  requireAgentPreparation?: boolean
  payerIdentity?: string
  directOnly?: boolean
  env?: NodeJS.ProcessEnv
}, dependencies: Dependencies = defaults) {
  if (!dependencies.hasStore()) throw new Error('Arc Agreement activation storage is not configured.')
  const agreementId = requireAgreementId(input.agreementId)
  const transactionHash = requireTransactionHash(input.transactionHash)
  const snapshot = await dependencies.read(STORE_KEY)
  if (!snapshot) throw new Error('Arc Agreement activation attempt was not found for this project.')
  const observedAttempt = requireProjectAttempt(snapshot, input.policy, agreementId)
  if (!isAddress(input.payer) || getAddress(input.payer) !== observedAttempt.prepared.payer) {
    throw new Error('Only the prepared agreement payer can submit this transaction.')
  }
  if (input.requireAgentPreparation) {
    if (!input.payerIdentity || observedAttempt.payerIdentityHash !== arcAgreementPayerIdentityHash(input.payerIdentity)) {
      throw new Error('This Arc Agreement is bound to another authenticated agent payer.')
    }
    const preparation = latestAgentCallPreparation(observedAttempt, input.stage)
    if (!preparation || preparation.deploymentHash !== observedAttempt.prepared.deploymentHash) {
      throw new Error('Prepare the exact agent payer call before recording its transaction.')
    }
  }
  if (input.recoverSubmittedChallenge) {
    const challenge = latestArcAgreementPayerChallenge(observedAttempt, input.stage)
    if (
      !challenge
      || challenge.status !== 'transaction_pending'
      || challenge.transactionHash !== transactionHash
      || challenge.walletAddress !== observedAttempt.prepared.payer
    ) {
      throw new Error('The Arc transaction is not bound to the durable Circle payer challenge.')
    }
  }
  const currentAuthorization = input.recoverSubmittedChallenge
    ? null
    : reauthorizeAttempt(
        observedAttempt,
        input.policy as DeveloperCheckoutPolicy,
        input.env ?? process.env,
      )
  const verifiedTransaction = await verifiedPayerTransaction({
    client: input.client,
    attempt: observedAttempt,
    stage: input.stage,
    transactionHash,
    recoverSubmittedChallenge: input.recoverSubmittedChallenge,
  })
  if (input.directOnly && verifiedTransaction.execution === 'circle_smart_wallet') {
    throw new Error('Agent payer transactions must use a direct call or exact Circle user operation.')
  }

  const timestamp = dependencies.now().toISOString()
  let replayed = false
  let durableAttempt: ArcAgreementActivationAttempt | undefined
  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const attempt = requireProjectAttempt(store, input.policy, agreementId)
    if (
      attempt.prepared.deploymentHash !== observedAttempt.prepared.deploymentHash
      || attempt.prepared.payer !== observedAttempt.prepared.payer
    ) {
      throw new Error('Arc Agreement activation commitment changed while recording the transaction.')
    }
    const recordingAttempt = verifiedTransaction.recoveredAttempt
      ? {
          ...attempt,
          activationTimestamp: verifiedTransaction.recoveredAttempt.activationTimestamp,
          prepared: verifiedTransaction.recoveredAttempt.prepared,
          calls: verifiedTransaction.recoveredAttempt.calls,
        }
      : attempt
    const indexed = store.transactionIndex[transactionHash]
    if (indexed && (indexed.attemptId !== attempt.id || indexed.stage !== input.stage)) {
      throw new Error('This Arc transaction hash is already bound to another activation action.')
    }
    const prior = transactionForStage(recordingAttempt, input.stage)
    if (prior?.status === 'submitted') {
      if (prior.hash !== transactionHash) {
        throw new Error('A payer transaction is already awaiting authoritative Arc reconciliation.')
      }
      replayed = true
      durableAttempt = attempt
      return store
    }
    if (prior?.status === 'confirmed') {
      if (prior.hash !== transactionHash) throw new Error('This payer action is already confirmed.')
      replayed = true
      durableAttempt = attempt
      return store
    }
    if (input.stage === 'approval' && recordingAttempt.status !== 'awaiting_approval' && recordingAttempt.status !== 'approval_failed') {
      throw new Error('The approval transaction is not expected in the current activation state.')
    }
    if (input.stage === 'activation' && recordingAttempt.status !== 'ready_to_activate' && recordingAttempt.status !== 'activation_failed') {
      throw new Error('The agreement cannot be activated before payer approval is confirmed.')
    }
    if (input.stage === 'activation' && currentAuthorization) {
      assertArcAgreementProjectCapacity({
        store,
        attempt: recordingAttempt,
        authorization: currentAuthorization,
        timestamp,
        ...(recordingAttempt.capacityReservation ? { excludeAttemptId: recordingAttempt.id } : {}),
      })
    }
    const transaction: ArcAgreementPayerTransaction = {
      hash: transactionHash,
      stage: input.stage,
      status: 'submitted',
      execution: verifiedTransaction.execution,
      submittedAt: timestamp,
    }
    const {
      capacityReservation: _capacityReservation,
      ...attemptWithoutCapacityReservation
    } = recordingAttempt
    durableAttempt = {
      ...attemptWithoutCapacityReservation,
      status: input.stage === 'approval' ? 'approval_submitted' : 'activation_submitted',
      transactions: [...attempt.transactions, transaction],
      updatedAt: timestamp,
    }
    store.attempts[attempt.id] = durableAttempt
    store.transactionIndex[transactionHash] = { attemptId: attempt.id, stage: input.stage }
    return store
  })
  if (!durableAttempt) throw new Error('Payer transaction could not be persisted.')
  return { attempt: durableAttempt, replayed }
}

export async function reconcileArcAgreementActivationAttempt(input: {
  client: ArcAgreementActivationClient
  policy: Pick<DeveloperCheckoutPolicy, 'partnerId'>
  agreementId: string
  confirmationBlocks?: number
}, dependencies: Dependencies = defaults) {
  if (!dependencies.hasStore()) throw new Error('Arc Agreement activation storage is not configured.')
  const agreementId = requireAgreementId(input.agreementId)
  const confirmations = confirmationBlocks(input.confirmationBlocks)
  if (await input.client.getChainId() !== 5_042_002) throw new Error('Activation reconciliation requires Arc Testnet.')
  const snapshot = await dependencies.read(STORE_KEY)
  if (!snapshot) throw new Error('Arc Agreement activation attempt was not found for this project.')
  const attempt = requireProjectAttempt(snapshot, input.policy, agreementId)
  const stage = attempt.status === 'approval_submitted'
    ? 'approval'
    : attempt.status === 'activation_submitted'
      ? 'activation'
      : null
  if (!stage) return { attempt, changed: false, pending: false }
  const transaction = transactionForStage(attempt, stage)
  if (!transaction || transaction.status !== 'submitted') {
    throw new Error('Activation state is missing its submitted payer transaction.')
  }
  const receipt = await input.client.getTransactionReceipt({ hash: transaction.hash })
  if (!receipt) return { attempt, changed: false, pending: true }
  const head = await input.client.getBlockNumber()
  if (!confirmedDepth(head, receipt.blockNumber, confirmations)) {
    return { attempt, changed: false, pending: true }
  }
  const observedBlockNumber = head - BigInt(confirmations)
  const timestamp = dependencies.now().toISOString()
  let durableAttempt: ArcAgreementActivationAttempt | undefined

  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const currentAttempt = requireProjectAttempt(store, input.policy, agreementId)
    const currentTransaction = transactionForStage(currentAttempt, stage)
    if (!currentTransaction || currentTransaction.hash !== transaction.hash || currentTransaction.status !== 'submitted') {
      durableAttempt = currentAttempt
      return store
    }
    if (receipt.status === 'reverted') {
      durableAttempt = {
        ...currentAttempt,
        status: stage === 'approval' ? 'approval_failed' : 'activation_failed',
        transactions: replaceTransaction(currentAttempt.transactions, transaction.hash, item => ({
          ...item,
          status: 'failed',
          confirmedAt: timestamp,
          blockNumber: receipt.blockNumber.toString(),
          failure: 'transaction_reverted',
        })),
        observedBlockNumber: observedBlockNumber.toString(),
        updatedAt: timestamp,
      }
      store.attempts[currentAttempt.id] = durableAttempt
      return store
    }
    durableAttempt = currentAttempt
    return store
  })
  if (!durableAttempt) throw new Error('Activation reconciliation state could not be persisted.')
  if (receipt.status === 'reverted') return { attempt: durableAttempt, changed: true, pending: false }

  const prepared = hydratePrepared(durableAttempt.prepared)
  if (stage === 'approval') {
    const allowance = BigInt(String(await input.client.readContract({
      address: prepared.usdc,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [prepared.payer, prepared.factory],
      blockNumber: observedBlockNumber,
    })))
    const approved = allowance >= prepared.totalAmount
    await dependencies.mutate(STORE_KEY, current => {
      const store = safeStore(current)
      const currentAttempt = requireProjectAttempt(store, input.policy, agreementId)
      const currentTransaction = transactionForStage(currentAttempt, 'approval')
      if (!currentTransaction || currentTransaction.hash !== transaction.hash || currentTransaction.status !== 'submitted') {
        durableAttempt = currentAttempt
        return store
      }
      durableAttempt = {
        ...currentAttempt,
        status: approved ? 'ready_to_activate' : 'approval_failed',
        transactions: replaceTransaction(currentAttempt.transactions, transaction.hash, item => ({
          ...item,
          status: approved ? 'confirmed' : 'failed',
          confirmedAt: timestamp,
          blockNumber: receipt.blockNumber.toString(),
          ...(approved ? {} : { failure: 'allowance_not_confirmed' as const }),
        })),
        observedBlockNumber: observedBlockNumber.toString(),
        updatedAt: timestamp,
      }
      store.attempts[currentAttempt.id] = durableAttempt
      return store
    })
    return { attempt: durableAttempt!, changed: true, pending: false }
  }

  const escrowValue = String(await input.client.readContract({
    address: prepared.factory,
    abi: factoryAbi,
    functionName: 'agreementEscrow',
    args: [prepared.agreementId],
    blockNumber: observedBlockNumber,
  }))
  if (!isAddress(escrowValue) || getAddress(escrowValue) === zeroAddress) {
    await dependencies.mutate(STORE_KEY, current => {
      const store = safeStore(current)
      const currentAttempt = requireProjectAttempt(store, input.policy, agreementId)
      const currentTransaction = transactionForStage(currentAttempt, 'activation')
      if (!currentTransaction || currentTransaction.hash !== transaction.hash || currentTransaction.status !== 'submitted') {
        durableAttempt = currentAttempt
        return store
      }
      durableAttempt = {
        ...currentAttempt,
        status: 'reconciliation_failed',
        transactions: replaceTransaction(currentAttempt.transactions, transaction.hash, item => ({
          ...item,
          status: 'failed',
          confirmedAt: timestamp,
          blockNumber: receipt.blockNumber.toString(),
          failure: 'escrow_not_created',
        })),
        observedBlockNumber: observedBlockNumber.toString(),
        updatedAt: timestamp,
      }
      store.attempts[currentAttempt.id] = durableAttempt
      return store
    })
    return { attempt: durableAttempt!, changed: true, pending: false }
  }
  const escrow = getAddress(escrowValue)
  const chainSnapshot = await readArcAgreementSnapshot(input.client, escrow, { blockNumber: observedBlockNumber })
  const reconciliation = reconcileArcAgreementSnapshot(prepared, chainSnapshot)
  const verified = reconciliation.verified && reconciliation.lifecycle === 'active'
  let activationWebhookEventId: string | undefined
  if (verified) {
    const event = buildArcAgreementWebhookEvent({
      partnerId: durableAttempt.partnerId,
      agreementId: durableAttempt.agreementId,
      prepared,
      snapshot: chainSnapshot,
      observedBlockNumber,
      createdAt: timestamp,
    })
    await dependencies.queueWebhook(event)
    activationWebhookEventId = event.id
  }
  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const currentAttempt = requireProjectAttempt(store, input.policy, agreementId)
    const currentTransaction = transactionForStage(currentAttempt, 'activation')
    if (!currentTransaction || currentTransaction.hash !== transaction.hash || currentTransaction.status !== 'submitted') {
      durableAttempt = currentAttempt
      return store
    }
    durableAttempt = {
      ...currentAttempt,
      status: verified ? 'active' : 'reconciliation_failed',
      transactions: replaceTransaction(currentAttempt.transactions, transaction.hash, item => ({
        ...item,
        status: verified ? 'confirmed' : 'failed',
        confirmedAt: timestamp,
        blockNumber: receipt.blockNumber.toString(),
        ...(verified ? {} : { failure: 'escrow_mismatch' as const }),
      })),
      ...(verified ? { escrow } : {}),
      observedBlockNumber: observedBlockNumber.toString(),
      ...(activationWebhookEventId ? { activationWebhookEventId } : {}),
      updatedAt: timestamp,
    }
    store.attempts[currentAttempt.id] = durableAttempt
    return store
  })
  return {
    attempt: durableAttempt!,
    changed: true,
    pending: false,
    ...(verified ? { snapshot: chainSnapshot, reconciliation } : { reconciliation }),
  }
}
