import { createHash } from 'node:crypto'
import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  isAddress,
  parseAbi,
  type Address,
  type Hex,
} from 'viem'
import {
  arcAgreementPayerIdentityHash,
  recordArcAgreementLifecycleObservation,
  readArcAgreementActivationBinding,
  type ArcAgreementActivationClient,
  type ArcAgreementLifecycleObservation,
  type ArcAgreementPayerCall,
} from './arc-agreement-activation-attempts.js'
import {
  readConfirmedArcAgreementSnapshot,
  type ArcAgreementConfirmedSnapshot,
} from './arc-agreement-confirmed-snapshot.js'
import { reconcileArcAgreementSnapshot } from './arc-agreement-reconciliation.js'
import {
  buildArcAgreementWebhookEvent,
  queueArcAgreementWebhookEvent,
} from './arc-agreement-webhooks.js'
import {
  hasRenderDurableStore,
  mutateDurableJson,
  readDurableJson,
} from './render-durable-store.js'

const STORE_KEY = (process.env.ARC_AGREEMENT_PAYER_LIFECYCLE_STORE_KEY
  ?? 'hashpaylink:arc-agreement-payer-lifecycle:v1').trim()
const AGREEMENT_ID = /^agr_[a-z0-9]{12,64}$/i
const PARTNER_ID = /^dev_[a-z0-9]{8,64}$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TX_HASH = /^0x[0-9a-f]{64}$/i
const MAX_CONFIRMATIONS = 128

const escrowAbi = parseAbi([
  'function cancelByPayer()',
  'function refundExpired()',
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

export type ArcAgreementPayerLifecycleActionName = 'cancel' | 'refund'
export type ArcAgreementPayerLifecycleActionStatus =
  | 'reserved'
  | 'issued'
  | 'transaction_pending'
  | 'submitted'
  | 'confirmed'
  | 'provider_failed'
  | 'failed'
  | 'manual_review'

export type ArcAgreementPayerLifecycleAction = {
  id: string
  partnerId: string
  agreementId: string
  action: ArcAgreementPayerLifecycleActionName
  payerIdentityHash: string
  walletId: string
  walletAddress: Address
  escrow: Address
  directCall: ArcAgreementPayerCall
  wrappedCall: ArcAgreementPayerCall
  requestHash: string
  sequence: number
  idempotencyKey: string
  status: ArcAgreementPayerLifecycleActionStatus
  executionMode?: 'circle' | 'agent_direct'
  challengeId?: string
  providerTransactionId?: string
  providerState?: string
  transactionHash?: Hex
  execution?: 'direct' | 'circle_smart_wallet' | 'circle_user_operation'
  submittedAt?: string
  confirmedAt?: string
  observedBlockNumber?: string
  webhookEventId?: string
  lastError?: string
  createdAt: string
  updatedAt: string
}

type Store = {
  actions: Record<string, ArcAgreementPayerLifecycleAction>
  transactionIndex: Record<string, string>
}

type Dependencies = {
  hasStore: () => boolean
  read: (key: string) => Promise<Store | undefined>
  mutate: (
    key: string,
    update: (current: Store | undefined) => Store | Promise<Store>,
  ) => Promise<Store>
  binding: typeof readArcAgreementActivationBinding
  confirmed: typeof readConfirmedArcAgreementSnapshot
  queueWebhook: typeof queueArcAgreementWebhookEvent
  recordObservation: typeof recordArcAgreementLifecycleObservation
  now: () => Date
}

const defaults: Dependencies = {
  hasStore: hasRenderDurableStore,
  read: readDurableJson,
  mutate: (key, update) => mutateDurableJson<Store>(key, update),
  binding: readArcAgreementActivationBinding,
  confirmed: readConfirmedArcAgreementSnapshot,
  queueWebhook: queueArcAgreementWebhookEvent,
  recordObservation: recordArcAgreementLifecycleObservation,
  now: () => new Date(),
}

function safeStore(value: Store | undefined): Store {
  return {
    actions: { ...(value?.actions ?? {}) },
    transactionIndex: { ...(value?.transactionIndex ?? {}) },
  }
}

function clean(value: unknown, max: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function required(value: unknown, pattern: RegExp, label: string, max: number) {
  const normalized = clean(value, max)
  if (!pattern.test(normalized)) throw new Error(`${label} is invalid.`)
  return normalized
}

function actionId(partnerId: string, agreementId: string) {
  const digest = createHash('sha256')
    .update(`${partnerId.toLowerCase()}\0${agreementId.toLowerCase()}`)
    .digest('hex')
  return `pal_${digest.slice(0, 24)}`
}

function uuidV4(seed: string) {
  const bytes = Buffer.from(createHash('sha256').update(seed).digest())
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function confirmationBlocks(value: number | undefined) {
  const parsed = value ?? Number(process.env.ARC_AGREEMENT_CONFIRMATION_BLOCKS || 5)
  if (!Number.isInteger(parsed) || parsed < 5 || parsed > MAX_CONFIRMATIONS) {
    throw new Error(`Arc Agreement payer lifecycle requires 5 to ${MAX_CONFIRMATIONS} confirmation blocks.`)
  }
  return parsed
}

function directCall(
  chainId: 5042002,
  escrow: Address,
  action: ArcAgreementPayerLifecycleActionName,
): ArcAgreementPayerCall {
  return Object.freeze({
    chainId,
    to: escrow,
    data: encodeFunctionData({
      abi: escrowAbi,
      functionName: action === 'cancel' ? 'cancelByPayer' : 'refundExpired',
    }),
    value: '0',
  })
}

function wrappedCall(payer: Address, call: ArcAgreementPayerCall): ArcAgreementPayerCall {
  return Object.freeze({
    chainId: call.chainId,
    to: payer,
    data: encodeFunctionData({
      abi: smartWalletAbi,
      functionName: 'executeBatch',
      args: [[{ target: call.to, value: 0n, data: call.data }]],
    }),
    value: '0',
  })
}

function immutableRequestHash(input: {
  partnerId: string
  agreementId: string
  action: ArcAgreementPayerLifecycleActionName
  payerIdentityHash: string
  walletId: string
  walletAddress: Address
  escrow: Address
  directCall: ArcAgreementPayerCall
  wrappedCall: ArcAgreementPayerCall
}) {
  return createHash('sha256').update(JSON.stringify({
    schema: 1,
    domain: 'hashpaylink.arc-agreement.payer-lifecycle',
    partnerId: input.partnerId,
    agreementId: input.agreementId,
    action: input.action,
    payerIdentityHash: input.payerIdentityHash,
    walletId: input.walletId.toLowerCase(),
    walletAddress: input.walletAddress.toLowerCase(),
    escrow: input.escrow.toLowerCase(),
    directCall: input.directCall,
    wrappedCall: input.wrappedCall,
  })).digest('hex')
}

function eligibility(
  confirmed: ArcAgreementConfirmedSnapshot,
  blockTimestamp: bigint,
) {
  const snapshot = confirmed.snapshot
  const cancelReason = snapshot.status !== 1
    ? 'terminal'
    : snapshot.releasedAmount !== 0n
      ? 'release_started'
      : snapshot.cancelUntil === 0n
        ? 'not_configured'
        : blockTimestamp > snapshot.cancelUntil
          ? 'window_closed'
          : null
  const refundReason = snapshot.status !== 1
    ? 'terminal'
    : blockTimestamp < snapshot.expiresAt
      ? 'not_expired'
      : null
  return {
    cancel: { eligible: cancelReason === null, reason: cancelReason },
    refund: { eligible: refundReason === null, reason: refundReason },
  }
}

async function persistLifecycleObservation(input: {
  client: ArcAgreementActivationClient
  partnerId: string
  agreementId: string
  confirmed: ArcAgreementConfirmedSnapshot
  reconciliation: ReturnType<typeof reconcileArcAgreementSnapshot>
  event: ReturnType<typeof buildArcAgreementWebhookEvent>
  observedAt: string
}, dependencies: Dependencies) {
  const block = await input.client.getBlock({ blockNumber: input.confirmed.observedBlockNumber })
  const status = input.event.event === 'agreement.expired'
    ? 'expired'
    : input.reconciliation.lifecycle
  if (!['active', 'expired', 'completed', 'cancelled', 'refunded'].includes(status)) {
    throw new Error(`Unsupported verified agreement lifecycle: ${status}.`)
  }
  const observation: ArcAgreementLifecycleObservation = {
    status: status as ArcAgreementLifecycleObservation['status'],
    nextStep: input.confirmed.snapshot.nextStep,
    releasedAmountUsdcUnits: input.reconciliation.releasedAmount,
    obligationAmountUsdcUnits: input.reconciliation.obligationAmount,
    excessAmountUsdcUnits: input.reconciliation.excessAmount,
    observedBlockNumber: input.confirmed.observedBlockNumber.toString(),
    observedBlockTimestamp: new Date(Number(block.timestamp) * 1_000).toISOString(),
    eventId: input.event.id,
    observedAt: input.observedAt,
  }
  return dependencies.recordObservation(input.partnerId, input.agreementId, observation)
}

function requireWallet(input: { walletId: string; walletAddress: string }) {
  const walletId = clean(input.walletId, 256)
  if (!walletId || !isAddress(input.walletAddress)) {
    throw new Error('A valid linked Circle Arc wallet is required.')
  }
  return { walletId, walletAddress: getAddress(input.walletAddress) }
}

function requireLifecycleEnabled(env: NodeJS.ProcessEnv) {
  if (String(env.ARC_AGREEMENT_PAYER_LIFECYCLE_ENABLED ?? '').trim().toLowerCase() !== 'true') {
    throw new Error('Arc Agreement payer lifecycle actions are disabled.')
  }
}

export async function reviewArcAgreementPayerLifecycle(input: {
  client: ArcAgreementActivationClient
  partnerId: string
  agreementId: string
  payerIdentity: string
  walletId: string
  walletAddress: string
  confirmationBlocks?: number
  checkoutMode?: 'human' | 'agentic'
}, dependencies: Dependencies = defaults) {
  const partnerId = required(input.partnerId, PARTNER_ID, 'Developer project id', 80)
  const agreementId = required(input.agreementId, AGREEMENT_ID, 'Agreement id', 80)
  const identityHash = arcAgreementPayerIdentityHash(input.payerIdentity)
  const wallet = requireWallet(input)
  const binding = await dependencies.binding(partnerId, agreementId)
  const checkoutMode = input.checkoutMode ?? 'human'
  if (
    binding.checkoutMode !== checkoutMode
    || binding.payerIdentityHash !== identityHash
    || binding.prepared.payer !== wallet.walletAddress
  ) {
    throw new Error('Only the authenticated agreement payer can manage this escrow.')
  }
  const confirmed = await dependencies.confirmed(
    input.client,
    binding.escrow,
    confirmationBlocks(input.confirmationBlocks),
  )
  const reconciliation = reconcileArcAgreementSnapshot(binding.prepared, confirmed.snapshot)
  if (!reconciliation.verified) {
    throw new Error(`Payer lifecycle blocked by reconciliation: ${reconciliation.mismatches.join(', ')}.`)
  }
  const block = await input.client.getBlock({ blockNumber: confirmed.observedBlockNumber })
  const store = dependencies.hasStore() ? await dependencies.read(STORE_KEY) : undefined
  const current = store?.actions?.[actionId(partnerId, agreementId)] ?? null
  if (
    current
    && (
      current.payerIdentityHash !== identityHash
      || current.walletAddress !== wallet.walletAddress
      || current.escrow !== binding.escrow
    )
  ) {
    throw new Error('Durable payer lifecycle action does not match the authenticated agreement binding.')
  }
  return {
    binding,
    confirmed,
    observedBlockTimestamp: block.timestamp,
    eligibility: eligibility(confirmed, block.timestamp),
    action: current ? Object.freeze({ ...current }) : null,
  }
}

export async function reserveArcAgreementPayerLifecycleAction(input: {
  client: ArcAgreementActivationClient
  partnerId: string
  agreementId: string
  payerIdentity: string
  walletId: string
  walletAddress: string
  action: ArcAgreementPayerLifecycleActionName
  env?: NodeJS.ProcessEnv
}, dependencies: Dependencies = defaults) {
  return reservePayerLifecycleAction({ ...input, checkoutMode: 'human', executionMode: 'circle' }, dependencies)
}

async function reservePayerLifecycleAction(input: {
  client: ArcAgreementActivationClient
  partnerId: string
  agreementId: string
  payerIdentity: string
  walletId: string
  walletAddress: string
  action: ArcAgreementPayerLifecycleActionName
  checkoutMode: 'human' | 'agentic'
  executionMode: 'circle' | 'agent_direct'
  env?: NodeJS.ProcessEnv
}, dependencies: Dependencies) {
  if (!dependencies.hasStore()) throw new Error('Arc Agreement payer lifecycle storage is not configured.')
  requireLifecycleEnabled(input.env ?? process.env)
  const reviewed = await reviewArcAgreementPayerLifecycle({ ...input, checkoutMode: input.checkoutMode }, dependencies)
  if (!reviewed.eligibility[input.action].eligible) {
    throw new Error(
      input.action === 'cancel'
        ? 'This agreement is no longer eligible for payer cancellation.'
        : 'This agreement is not yet eligible for expiry refund.',
    )
  }
  const wallet = requireWallet(input)
  const call = directCall(reviewed.binding.prepared.chainId, reviewed.binding.escrow, input.action)
  const wrapped = wrappedCall(wallet.walletAddress, call)
  const identityHash = arcAgreementPayerIdentityHash(input.payerIdentity)
  const requestHash = immutableRequestHash({
    partnerId: reviewed.binding.partnerId,
    agreementId: reviewed.binding.agreementId,
    action: input.action,
    payerIdentityHash: identityHash,
    walletId: wallet.walletId,
    walletAddress: wallet.walletAddress,
    escrow: reviewed.binding.escrow,
    directCall: call,
    wrappedCall: wrapped,
  })
  const id = actionId(reviewed.binding.partnerId, reviewed.binding.agreementId)
  const timestamp = dependencies.now().toISOString()
  let durable: ArcAgreementPayerLifecycleAction | undefined
  let replayed = false
  let sequence = 0
  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const existing = store.actions[id]
    if (existing) {
      if (
        existing.requestHash !== requestHash
        || existing.action !== input.action
        || existing.walletAddress !== wallet.walletAddress
      ) {
        throw new Error('Another payer lifecycle action is already bound to this agreement.')
      }
      if (existing.status === 'confirmed') {
        throw new Error('This payer lifecycle action is already confirmed.')
      }
      if (['submitted', 'manual_review'].includes(existing.status)) {
        throw new Error('The existing payer lifecycle action must be reconciled before another confirmation.')
      }
      if (['provider_failed', 'failed'].includes(existing.status) && !existing.providerTransactionId && !existing.transactionHash) {
        sequence = (existing.sequence ?? 0) + 1
      } else if (['provider_failed', 'failed'].includes(existing.status)) {
        throw new Error('The existing payer lifecycle transaction requires review before retry.')
      } else {
        replayed = true
        durable = existing
        return store
      }
    }
    const action: ArcAgreementPayerLifecycleAction = {
      id,
      partnerId: reviewed.binding.partnerId,
      agreementId: reviewed.binding.agreementId,
      action: input.action,
      payerIdentityHash: identityHash,
      walletId: wallet.walletId,
      walletAddress: wallet.walletAddress,
      escrow: reviewed.binding.escrow,
      directCall: call,
      wrappedCall: wrapped,
      requestHash,
      sequence,
      idempotencyKey: uuidV4(`${id}\0${requestHash}\0${sequence}`),
      status: 'reserved',
      executionMode: input.executionMode,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    store.actions[id] = action
    durable = action
    return store
  })
  if (!durable) throw new Error('Payer lifecycle action was not persisted.')
  return {
    action: Object.freeze({ ...durable }),
    call: input.executionMode === 'agent_direct' ? call : wrapped,
    replayed,
  }
}

export async function prepareArcAgreementAgentPayerLifecycleCall(input: {
  client: ArcAgreementActivationClient
  partnerId: string
  agreementId: string
  payerIdentity: string
  walletAddress: string
  action: ArcAgreementPayerLifecycleActionName
  env?: NodeJS.ProcessEnv
}, dependencies: Dependencies = defaults) {
  const identityHash = arcAgreementPayerIdentityHash(input.payerIdentity)
  return reservePayerLifecycleAction({
    ...input,
    walletId: `agent_${identityHash.slice(0, 40)}`,
    checkoutMode: 'agentic',
    executionMode: 'agent_direct',
  }, dependencies)
}

function requireActionBinding(
  action: ArcAgreementPayerLifecycleAction,
  input: { partnerId: string; agreementId: string; payerIdentity: string },
) {
  if (
    action.partnerId !== input.partnerId
    || action.agreementId !== input.agreementId
    || action.payerIdentityHash !== arcAgreementPayerIdentityHash(input.payerIdentity)
  ) {
    throw new Error('Payer lifecycle action does not belong to this authenticated payer.')
  }
}

export async function readArcAgreementPayerLifecycleAction(input: {
  partnerId: string
  agreementId: string
  payerIdentity: string
}, dependencies: Dependencies = defaults) {
  if (!dependencies.hasStore()) return null
  const partnerId = required(input.partnerId, PARTNER_ID, 'Developer project id', 80)
  const agreementId = required(input.agreementId, AGREEMENT_ID, 'Agreement id', 80)
  const store = await dependencies.read(STORE_KEY)
  const action = store?.actions?.[actionId(partnerId, agreementId)]
  if (!action) return null
  requireActionBinding(action, { ...input, partnerId, agreementId })
  return Object.freeze({ ...action })
}

export async function listArcAgreementPayerLifecycleActions(
  input: { partnerId?: string; limit?: number } = {},
  dependencies: Dependencies = defaults,
) {
  if (!dependencies.hasStore()) return []
  const partnerId = input.partnerId
    ? required(input.partnerId, PARTNER_ID, 'Developer project id', 80)
    : ''
  const limit = Math.min(250, Math.max(1, Math.trunc(input.limit ?? 100)))
  const store = await dependencies.read(STORE_KEY)
  return Object.values(store?.actions ?? {})
    .filter(action => !partnerId || action.partnerId === partnerId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit)
    .map(action => Object.freeze({ ...action }))
}

async function updateAction(
  input: { partnerId: string; agreementId: string; payerIdentity: string },
  update: (action: ArcAgreementPayerLifecycleAction, timestamp: string, store: Store) => ArcAgreementPayerLifecycleAction,
  dependencies: Dependencies,
) {
  let durable: ArcAgreementPayerLifecycleAction | undefined
  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const id = actionId(input.partnerId, input.agreementId)
    const action = store.actions[id]
    if (!action) throw new Error('Payer lifecycle action was not found.')
    requireActionBinding(action, input)
    durable = update(action, dependencies.now().toISOString(), store)
    store.actions[id] = durable
    return store
  })
  if (!durable) throw new Error('Payer lifecycle action update was not persisted.')
  return Object.freeze({ ...durable })
}

export async function attachArcAgreementPayerLifecycleChallenge(input: {
  partnerId: string
  agreementId: string
  payerIdentity: string
  challengeId: string
  providerTransactionId?: string
}, dependencies: Dependencies = defaults) {
  const challengeId = clean(input.challengeId, 256)
  if (!challengeId || !/^[a-zA-Z0-9_-]+$/.test(challengeId)) throw new Error('Circle payer challenge id is invalid.')
  const providerTransactionId = input.providerTransactionId
    ? required(input.providerTransactionId, UUID, 'Circle payer transaction id', 36).toLowerCase()
    : undefined
  return updateAction(input, (action, timestamp) => {
    if (action.challengeId && action.challengeId !== challengeId) {
      throw new Error('Circle returned a different challenge for this payer lifecycle action.')
    }
    if (
      action.providerTransactionId
      && providerTransactionId
      && action.providerTransactionId !== providerTransactionId
    ) {
      throw new Error('Circle returned a different transaction for this payer lifecycle action.')
    }
    return {
      ...action,
      challengeId,
      ...(providerTransactionId ? { providerTransactionId } : {}),
      status: providerTransactionId ? 'transaction_pending' : 'issued',
      updatedAt: timestamp,
    }
  }, dependencies)
}

export async function observeArcAgreementPayerLifecycleAction(input: {
  partnerId: string
  agreementId: string
  payerIdentity: string
  status: 'issued' | 'transaction_pending' | 'provider_failed' | 'manual_review'
  providerTransactionId?: string
  providerState?: string
  transactionHash?: string
}, dependencies: Dependencies = defaults) {
  const providerTransactionId = input.providerTransactionId
    ? required(input.providerTransactionId, UUID, 'Circle payer transaction id', 36).toLowerCase()
    : undefined
  const transactionHash = input.transactionHash
    ? required(input.transactionHash, TX_HASH, 'Arc transaction hash', 66).toLowerCase() as Hex
    : undefined
  const providerState = clean(input.providerState, 40).toUpperCase()
  return updateAction(input, (action, timestamp) => {
    if (
      action.providerTransactionId
      && providerTransactionId
      && action.providerTransactionId !== providerTransactionId
    ) {
      return {
        ...action,
        status: 'manual_review',
        lastError: 'Circle returned a different transaction for the durable payer lifecycle action.',
        updatedAt: timestamp,
      }
    }
    if (
      action.transactionHash
      && transactionHash
      && action.transactionHash !== transactionHash
    ) {
      return {
        ...action,
        status: 'manual_review',
        lastError: 'Circle returned a different Arc hash for the durable payer lifecycle action.',
        updatedAt: timestamp,
      }
    }
    return {
      ...action,
      status: input.status,
      ...(providerTransactionId ? { providerTransactionId } : {}),
      ...(transactionHash ? { transactionHash } : {}),
      ...(providerState ? { providerState } : {}),
      updatedAt: timestamp,
    }
  }, dependencies)
}

async function verifyPayerLifecycleTransaction(input: {
  client: ArcAgreementActivationClient
  action: ArcAgreementPayerLifecycleAction
  transactionHash: Hex
}) {
  if (await input.client.getChainId() !== 5_042_002) {
    throw new Error('Payer lifecycle transaction is not on Arc Testnet.')
  }
  const transaction = await input.client.getTransaction({ hash: input.transactionHash })
  if (transaction.hash.toLowerCase() !== input.transactionHash || transaction.value !== 0n) {
    throw new Error('Arc RPC returned an invalid payer lifecycle transaction.')
  }
  const direct = (
    getAddress(transaction.from) === input.action.walletAddress
    && transaction.to !== null
    && getAddress(transaction.to) === input.action.directCall.to
    && transaction.input.toLowerCase() === input.action.directCall.data.toLowerCase()
  )
  const wrapped = (
    transaction.to !== null
    && getAddress(transaction.to) === input.action.wrappedCall.to
    && transaction.input.toLowerCase() === input.action.wrappedCall.data.toLowerCase()
  )
  let userOperation = false
  if (transaction.to !== null && getAddress(transaction.to) === ENTRY_POINT_V06) {
    try {
      const entryPointCall = decodeFunctionData({
        abi: entryPointV06Abi,
        data: transaction.input,
      })
      if (entryPointCall.functionName === 'handleOps') {
        const [operations] = entryPointCall.args
        if (operations.length === 1 && getAddress(operations[0].sender) === input.action.walletAddress) {
          const accountCall = decodeFunctionData({
            abi: circleAccountAbi,
            data: operations[0].callData,
          })
          if (accountCall.functionName === 'execute') {
            const [destination, value, callData] = accountCall.args
            userOperation = (
              value === 0n
              && (
                (
                  getAddress(destination) === input.action.directCall.to
                  && callData.toLowerCase() === input.action.directCall.data.toLowerCase()
                )
                || (
                  getAddress(destination) === input.action.walletAddress
                  && callData.toLowerCase() === input.action.wrappedCall.data.toLowerCase()
                )
              )
            )
          }
        }
      }
    } catch {
      userOperation = false
    }
  }
  if (direct) return 'direct' as const
  if (wrapped) return 'circle_smart_wallet' as const
  if (userOperation) return 'circle_user_operation' as const
  throw new Error('Payer lifecycle transaction does not match the prepared direct, Circle smart-wallet, or Circle user-operation call.')
}

export async function recordArcAgreementPayerLifecycleTransaction(input: {
  client: ArcAgreementActivationClient
  partnerId: string
  agreementId: string
  payerIdentity: string
  transactionHash: string
  requireAgentPreparation?: boolean
  directOnly?: boolean
}, dependencies: Dependencies = defaults) {
  if (!dependencies.hasStore()) throw new Error('Arc Agreement payer lifecycle storage is not configured.')
  const transactionHash = required(input.transactionHash, TX_HASH, 'Arc transaction hash', 66).toLowerCase() as Hex
  const action = await readArcAgreementPayerLifecycleAction(input, dependencies)
  if (!action) throw new Error('Payer lifecycle action was not found.')
  if (input.requireAgentPreparation && action.executionMode !== 'agent_direct') {
    throw new Error('Prepare this agent lifecycle call before recording its transaction.')
  }
  const execution = await verifyPayerLifecycleTransaction({
    client: input.client,
    action,
    transactionHash,
  })
  if (input.directOnly && execution !== 'direct') {
    throw new Error('Agent lifecycle transactions must directly execute the prepared escrow call.')
  }
  let replayed = false
  const durable = await updateAction(input, (current, timestamp, store) => {
    const indexed = store.transactionIndex[transactionHash]
    if (indexed && indexed !== current.id) {
      throw new Error('This Arc transaction hash is already bound to another payer lifecycle action.')
    }
    if (current.transactionHash) {
      if (current.transactionHash !== transactionHash) {
        throw new Error('Another Arc transaction is already bound to this payer lifecycle action.')
      }
      if (['submitted', 'confirmed'].includes(current.status)) {
        replayed = true
        return current
      }
    }
    store.transactionIndex[transactionHash] = current.id
    return {
      ...current,
      status: 'submitted',
      transactionHash,
      execution,
      submittedAt: timestamp,
      updatedAt: timestamp,
    }
  }, dependencies)
  return { action: durable, replayed }
}

export async function reconcileArcAgreementPayerLifecycleAction(input: {
  client: ArcAgreementActivationClient
  partnerId: string
  agreementId: string
  payerIdentity: string
  confirmationBlocks?: number
}, dependencies: Dependencies = defaults) {
  let action = await readArcAgreementPayerLifecycleAction(input, dependencies)
  if (!action || action.status === 'failed') {
    return { action, pending: false, changed: false }
  }
  if (action.status === 'confirmed') {
    if (!action.transactionHash) {
      throw new Error('Confirmed payer lifecycle action is missing its Arc transaction hash.')
    }
    await verifyPayerLifecycleTransaction({
      client: input.client,
      action,
      transactionHash: action.transactionHash,
    })
    const confirmations = confirmationBlocks(input.confirmationBlocks)
    const binding = await dependencies.binding(action.partnerId, action.agreementId)
    if (
      binding.payerIdentityHash !== action.payerIdentityHash
      || binding.prepared.payer !== action.walletAddress
      || binding.escrow !== action.escrow
    ) {
      throw new Error('Payer lifecycle action no longer matches the durable agreement binding.')
    }
    const confirmed = await dependencies.confirmed(input.client, binding.escrow, confirmations)
    const reconciliation = reconcileArcAgreementSnapshot(binding.prepared, confirmed.snapshot)
    const expectedStatus = action.action === 'cancel' ? 3 : 4
    if (!reconciliation.verified || confirmed.snapshot.status !== expectedStatus) {
      throw new Error('Confirmed payer lifecycle webhook backfill does not match authoritative Arc state.')
    }
    const observedAt = dependencies.now().toISOString()
    const event = buildArcAgreementWebhookEvent({
      partnerId: action.partnerId,
      agreementId: action.agreementId,
      prepared: binding.prepared,
      snapshot: confirmed.snapshot,
      observedBlockNumber: confirmed.observedBlockNumber,
      createdAt: observedAt,
    })
    if (!action.webhookEventId) await dependencies.queueWebhook(event)
    const recorded = await persistLifecycleObservation({
      client: input.client,
      partnerId: action.partnerId,
      agreementId: action.agreementId,
      confirmed,
      reconciliation,
      event,
      observedAt,
    }, dependencies)
    if (action.webhookEventId) {
      return { action, pending: false, changed: !recorded.replayed }
    }
    const backfilled = await updateAction(input, (current, timestamp) => ({
      ...current,
      webhookEventId: event.id,
      updatedAt: timestamp,
    }), dependencies)
    return { action: backfilled, pending: false, changed: true }
  }
  if (action.status === 'transaction_pending' && action.transactionHash) {
    const recovered = await recordArcAgreementPayerLifecycleTransaction({
      client: input.client,
      partnerId: input.partnerId,
      agreementId: input.agreementId,
      payerIdentity: input.payerIdentity,
      transactionHash: action.transactionHash,
    }, dependencies)
    action = recovered.action
  }
  if (action.status !== 'submitted' || !action.transactionHash) {
    return { action, pending: true, changed: false }
  }
  await verifyPayerLifecycleTransaction({
    client: input.client,
    action,
    transactionHash: action.transactionHash,
  })
  const receipt = await input.client.getTransactionReceipt({ hash: action.transactionHash })
  if (!receipt) return { action, pending: true, changed: false }
  const confirmations = confirmationBlocks(input.confirmationBlocks)
  const head = await input.client.getBlockNumber()
  if (head < receipt.blockNumber + BigInt(confirmations)) {
    return { action, pending: true, changed: false }
  }
  const observedBlockNumber = head - BigInt(confirmations)
  if (receipt.status === 'reverted') {
    const failed = await updateAction(input, (current, timestamp) => ({
      ...current,
      status: 'failed',
      confirmedAt: timestamp,
      observedBlockNumber: observedBlockNumber.toString(),
      lastError: 'The payer lifecycle transaction reverted on Arc.',
      updatedAt: timestamp,
    }), dependencies)
    return { action: failed, pending: false, changed: true }
  }
  const binding = await dependencies.binding(action.partnerId, action.agreementId)
  if (
    binding.payerIdentityHash !== action.payerIdentityHash
    || binding.prepared.payer !== action.walletAddress
    || binding.escrow !== action.escrow
  ) {
    throw new Error('Payer lifecycle action no longer matches the durable agreement binding.')
  }
  const confirmed = await dependencies.confirmed(input.client, binding.escrow, confirmations)
  if (receipt.blockNumber > confirmed.observedBlockNumber) {
    return { action, pending: true, changed: false }
  }
  const reconciliation = reconcileArcAgreementSnapshot(binding.prepared, confirmed.snapshot)
  if (!reconciliation.verified) {
    throw new Error(`Payer lifecycle result blocked by reconciliation: ${reconciliation.mismatches.join(', ')}.`)
  }
  const expectedStatus = action.action === 'cancel' ? 3 : 4
  if (confirmed.snapshot.status !== expectedStatus) {
    return { action, pending: true, changed: false }
  }
  const observedAt = dependencies.now().toISOString()
  const event = buildArcAgreementWebhookEvent({
    partnerId: action.partnerId,
    agreementId: action.agreementId,
    prepared: binding.prepared,
    snapshot: confirmed.snapshot,
    observedBlockNumber: confirmed.observedBlockNumber,
    createdAt: observedAt,
  })
  await dependencies.queueWebhook(event)
  await persistLifecycleObservation({
    client: input.client,
    partnerId: action.partnerId,
    agreementId: action.agreementId,
    confirmed,
    reconciliation,
    event,
    observedAt,
  }, dependencies)
  const completed = await updateAction(input, (current, timestamp) => ({
    ...current,
    status: 'confirmed',
    confirmedAt: timestamp,
    observedBlockNumber: confirmed.observedBlockNumber.toString(),
    webhookEventId: event.id,
    lastError: undefined,
    updatedAt: timestamp,
  }), dependencies)
  return { action: completed, pending: false, changed: true }
}
