import type { Request, Response } from 'express'
import { decodeFunctionData, getAddress, isAddress, parseAbi } from 'viem'
import {
  arcAgreementPayerIdentityHash,
  prepareArcAgreementActivationAttempt,
  prepareArcAgreementAgentPayerCall,
  readArcAgreementActivationAttempt,
  recordArcAgreementPayerTransaction,
  reconcileArcAgreementActivationAttempt,
  type ArcAgreementActivationAttempt,
  type ArcAgreementActivationClient,
} from './arc-agreement-activation-attempts.js'
import { createArcAgreementActivationClient } from './arc-agreement-activation-client.js'
import {
  readArcAgreementForProject,
  type ArcAgreement,
} from './arc-agreements.js'
import {
  prepareArcAgreementAgentPayerLifecycleCall,
  reconcileArcAgreementPayerLifecycleAction,
  recordArcAgreementPayerLifecycleTransaction,
  reviewArcAgreementPayerLifecycle,
  type ArcAgreementPayerLifecycleAction,
} from './arc-agreement-payer-lifecycle.js'
import {
  approveArcAgreementOperatorAction,
  disputeArcAgreementOperatorAction,
  listArcAgreementOperatorActions,
  type ArcAgreementOperatorAction,
} from './arc-agreement-operator-actions.js'
import {
  resolveDeveloperApiKeyPolicy,
  type DeveloperCheckoutPolicy,
} from './developer-projects.js'
import { executeArcAgreementAgentWalletCall, getAgentWalletRecord } from './agent-wallet.js'
import {
  claimCirclePocketAction,
  recordCirclePocketAction,
  type CirclePocketActionRecord,
} from './circle-pocket-action-journal.js'
import { circleLinkKey, readCircleLink, type CircleLinkRecord } from './privy-circle-link.js'

const AGENT_EXECUTION_ACTION = 'arc-agreement.agent-wallet-execute'
const UNKNOWN_CIRCLE_EXECUTION_RETRY_AFTER_MS = 15 * 60_000
const AGENT_EXECUTION_ABI = parseAbi([
  'function approve(address spender,uint256 amount) returns (bool)',
  'function createAndFund((bytes32 clientReference,bytes32 termsHash,address recipient,uint8 template,uint256 totalAmount,uint64 cancelUntil,uint64 expiresAt,uint16[] cumulativeReleaseBps) params) returns (address)',
  'function cancelByPayer()',
  'function refundExpired()',
])

type Dependencies = {
  policy(req: Pick<Request, 'headers'>): Promise<DeveloperCheckoutPolicy | null>
  readAgreement(partnerId: string, agreementId: string): Promise<ArcAgreement | null>
  prepareAttempt: typeof prepareArcAgreementActivationAttempt
  readAttempt: typeof readArcAgreementActivationAttempt
  prepareCall: typeof prepareArcAgreementAgentPayerCall
  recordTransaction: typeof recordArcAgreementPayerTransaction
  reconcileAttempt: typeof reconcileArcAgreementActivationAttempt
  reviewLifecycle: typeof reviewArcAgreementPayerLifecycle
  prepareLifecycleCall: typeof prepareArcAgreementAgentPayerLifecycleCall
  recordLifecycleTransaction: typeof recordArcAgreementPayerLifecycleTransaction
  reconcileLifecycle: typeof reconcileArcAgreementPayerLifecycleAction
  listOperatorActions: typeof listArcAgreementOperatorActions
  approveOperatorAction: typeof approveArcAgreementOperatorAction
  disputeOperatorAction: typeof disputeArcAgreementOperatorAction
  readCircleLink(key: string): Promise<CircleLinkRecord | null>
  readAgentWallet(agentSlug: string): ReturnType<typeof getAgentWalletRecord>
  executeCircleCall(input: Parameters<typeof executeArcAgreementAgentWalletCall>[0]): ReturnType<typeof executeArcAgreementAgentWalletCall>
  claimExecution(input: Parameters<typeof claimCirclePocketAction>[0]): ReturnType<typeof claimCirclePocketAction>
  recordExecution(input: Parameters<typeof recordCirclePocketAction>[0]): Promise<CirclePocketActionRecord>
  client(): ArcAgreementActivationClient
  env(): NodeJS.ProcessEnv
  logError(message: string): void
}

const defaults: Dependencies = {
  policy: resolveDeveloperApiKeyPolicy,
  readAgreement: readArcAgreementForProject,
  prepareAttempt: prepareArcAgreementActivationAttempt,
  readAttempt: readArcAgreementActivationAttempt,
  prepareCall: prepareArcAgreementAgentPayerCall,
  recordTransaction: recordArcAgreementPayerTransaction,
  reconcileAttempt: reconcileArcAgreementActivationAttempt,
  reviewLifecycle: reviewArcAgreementPayerLifecycle,
  prepareLifecycleCall: prepareArcAgreementAgentPayerLifecycleCall,
  recordLifecycleTransaction: recordArcAgreementPayerLifecycleTransaction,
  reconcileLifecycle: reconcileArcAgreementPayerLifecycleAction,
  listOperatorActions: listArcAgreementOperatorActions,
  approveOperatorAction: approveArcAgreementOperatorAction,
  disputeOperatorAction: disputeArcAgreementOperatorAction,
  readCircleLink,
  readAgentWallet: getAgentWalletRecord,
  executeCircleCall: executeArcAgreementAgentWalletCall,
  claimExecution: claimCirclePocketAction,
  recordExecution: recordCirclePocketAction,
  client: createArcAgreementActivationClient,
  env: () => process.env,
  logError: message => console.error('[arc-agreement-agent] request failed:', message),
}

function clean(value: unknown, maximum: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum)
}

function fail(message: string, status: number) {
  return Object.assign(new Error(message), { status })
}

function requireAgentPolicy(policy: DeveloperCheckoutPolicy | null) {
  if (!policy) throw fail('A valid developer API key is required.', 401)
  if (policy.environment !== 'test' || policy.checkoutMode !== 'agentic') {
    throw fail('Agent agreement activation requires an agentic test project.', 403)
  }
  if (!policy.capabilities.includes('arc_agreements')) {
    throw fail('This project has not enabled Arc Agreements.', 403)
  }
  return policy
}

function payerIdentity(policy: DeveloperCheckoutPolicy, value: unknown) {
  const reference = clean(value, 80).toLowerCase()
  if (!/^apr_[a-f0-9]{32,64}$/.test(reference)) {
    throw fail('A stable opaque payer reference is required.', 400)
  }
  return `agent:${policy.partnerId}:${reference}`
}

function payerAddress(value: unknown) {
  const address = clean(value, 80)
  if (!isAddress(address)) throw fail('A valid Arc payer address is required.', 400)
  return getAddress(address)
}

function executionIdempotencyKey(req: Pick<Request, 'headers'>) {
  const value = clean(req.headers['idempotency-key'], 128)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{15,127}$/.test(value)) {
    throw fail('A valid Idempotency-Key header is required for Circle execution.', 400)
  }
  return value
}

function circleAgentWalletSlug(email: string) {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return ''
  let hash = 5381
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(index)) >>> 0
  }
  return `wallet-${hash.toString(36)}`
}

async function circleAgentIdentity(
  dependencies: Dependencies,
  policy: DeveloperCheckoutPolicy,
  payer: string,
) {
  if (!policy.ownerId) throw fail('This developer project has no wallet owner binding.', 409)
  const link = await dependencies.readCircleLink(circleLinkKey(policy.ownerId, 'arc', 'agent'))
  if (!link) {
    const agentSlug = circleAgentWalletSlug(policy.ownerEmail ?? '')
    if (!agentSlug) throw fail('This developer project has no verified wallet owner email.', 409)
    const wallet = await dependencies.readAgentWallet(agentSlug)
    if (!wallet?.walletAddress || !wallet.sessionId) {
      throw fail('Connect an Arc Circle Agent Wallet to this developer account first.', 409)
    }
    if (!['ARC-TESTNET', 'ARC_TESTNET', 'ARC'].includes(String(wallet.chain ?? '').trim().toUpperCase())) {
      throw fail('The connected agent wallet is not configured for Arc Testnet.', 409)
    }
    if (wallet.walletAddress.toLowerCase() !== payer.toLowerCase()) throw fail('Agreement not found.', 404)
    return { ownerId: policy.ownerId, agentSlug, walletAddress: getAddress(wallet.walletAddress) }
  }
  if (link.privyUserId !== policy.ownerId || link.chain !== 'arc' || link.purpose !== 'agent') {
    throw fail('The connected Arc Circle Agent Wallet binding is invalid.', 409)
  }
  if (!['ARC-TESTNET', 'ARC_TESTNET', 'ARC'].includes(link.circleBlockchain.trim().toUpperCase())) {
    throw fail('The connected agent wallet is not configured for Arc Testnet.', 409)
  }
  if (link.circleWalletAddress.toLowerCase() !== payer.toLowerCase()) throw fail('Agreement not found.', 404)
  const agentSlug = circleAgentWalletSlug(link.email ?? '')
  if (!agentSlug) throw fail('Reconnect the Circle Agent Wallet with a verified email.', 409)
  return { ownerId: policy.ownerId, agentSlug, walletAddress: getAddress(link.circleWalletAddress) }
}

function circleCall(call: { to: string; data: string; value: string }) {
  if (call.value !== '0') throw fail('Arc Agreement Circle execution cannot send native value.', 409)
  const decoded = decodeFunctionData({ abi: AGENT_EXECUTION_ABI, data: call.data as `0x${string}` })
  if (decoded.functionName === 'approve') {
    const [spender, amount] = decoded.args
    return {
      contractAddress: getAddress(call.to),
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [getAddress(spender), amount.toString()],
    }
  }
  if (decoded.functionName === 'createAndFund') {
    return {
      contractAddress: getAddress(call.to),
      abiFunctionSignature: 'createAndFund((bytes32,bytes32,address,uint8,uint256,uint64,uint64,uint16[]))',
      abiParameters: [],
      callData: call.data,
    }
  }
  if (decoded.functionName === 'cancelByPayer' || decoded.functionName === 'refundExpired') {
    return {
      contractAddress: getAddress(call.to),
      abiFunctionSignature: `${decoded.functionName}()`,
      abiParameters: [],
    }
  }
  throw fail('This Arc Agreement contract call is not allowed.', 409)
}

async function executePreparedCircleCall<T>(input: {
  req: Pick<Request, 'headers'>
  dependencies: Dependencies
  policy: DeveloperCheckoutPolicy
  agreementId: string
  operation: string
  payer: string
  call: { to: string; data: string; value: string }
  record(transactionHash: string): Promise<T>
}) {
  const key = executionIdempotencyKey(input.req)
  const wallet = await circleAgentIdentity(input.dependencies, input.policy, input.payer)
  const command = circleCall(input.call)
  const executionKey = `${input.policy.partnerId}:${input.agreementId}:${input.operation}`
  const metadata = {
    agreementId: input.agreementId,
    operation: input.operation,
    executionKey,
  }
  const claimInput: Parameters<Dependencies['claimExecution']>[0] = {
    ownerId: wallet.ownerId,
    idempotencyKey: key,
    action: AGENT_EXECUTION_ACTION,
    metadata,
    dedupe: {
      metadataKey: 'executionKey',
      metadataValue: executionKey,
      statuses: ['started', 'submitted', 'completed'],
    },
  }
  let claim = await input.dependencies.claimExecution(claimInput)
  if (
    !claim.claimed
    && claim.record.idempotencyKey !== key
    && claim.record.status === 'submitted'
    && !claim.record.resourceId
    && claim.record.updatedAt <= Date.now() - UNKNOWN_CIRCLE_EXECUTION_RETRY_AFTER_MS
  ) {
    await input.dependencies.recordExecution({
      ownerId: wallet.ownerId,
      idempotencyKey: claim.record.idempotencyKey,
      action: AGENT_EXECUTION_ACTION,
      status: 'failed',
      metadata: claim.record.metadata,
    })
    claim = await input.dependencies.claimExecution(claimInput)
  }
  if (!claim.claimed) {
    if (claim.record.metadata?.executionKey !== executionKey) {
      throw fail('This Idempotency-Key was already used for another Circle execution.', 409)
    }
    if (claim.record.resourceId && /^0x[a-fA-F0-9]{64}$/.test(claim.record.resourceId)) {
      return {
        replayed: true,
        pending: true,
        transactionHash: claim.record.resourceId,
        recorded: await input.record(claim.record.resourceId),
      }
    }
    if (claim.record.status === 'failed') {
      throw fail('The previous Circle execution failed. Resolve the wallet issue and retry with a new Idempotency-Key.', 409)
    }
    return { replayed: true, pending: true, transactionHash: null, recorded: null }
  }

  let executed: Awaited<ReturnType<typeof executeArcAgreementAgentWalletCall>>
  try {
    executed = await input.dependencies.executeCircleCall({
      agentSlug: wallet.agentSlug,
      walletAddress: wallet.walletAddress,
      ...command,
    })
  } catch (error) {
    const code = (error as Error & { code?: string }).code
    await input.dependencies.recordExecution({
      ownerId: wallet.ownerId,
      idempotencyKey: key,
      action: AGENT_EXECUTION_ACTION,
      status: code === 'circle_session_expired' ? 'failed' : 'submitted',
      metadata,
    }).catch(() => undefined)
    throw error
  }

  await input.dependencies.recordExecution({
    ownerId: wallet.ownerId,
    idempotencyKey: key,
    action: AGENT_EXECUTION_ACTION,
    status: 'submitted',
    resourceId: executed.transactionHash,
    metadata: {
      ...metadata,
      ...(executed.providerTransactionId ? { providerTransactionId: executed.providerTransactionId } : {}),
      ...(executed.providerState ? { providerState: executed.providerState } : {}),
    },
  })
  const recorded = await input.record(executed.transactionHash)
  await input.dependencies.recordExecution({
    ownerId: wallet.ownerId,
    idempotencyKey: key,
    action: AGENT_EXECUTION_ACTION,
    status: 'completed',
    resourceId: executed.transactionHash,
    metadata,
  })
  return {
    replayed: false,
    pending: true,
    transactionHash: executed.transactionHash,
    recorded,
  }
}

function publicAgreement(agreement: ArcAgreement) {
  const { requestHash: _requestHash, payerAccessHash: _payerAccessHash, ...record } = agreement
  return record
}

function publicAttempt(attempt: ArcAgreementActivationAttempt) {
  const {
    payerIdentityHash: _payerIdentityHash,
    challenges: _challenges,
    agentCallPreparations: _agentCallPreparations,
    capacityReservation: _capacityReservation,
    calls: _calls,
    ...record
  } = attempt
  return record
}

function publicLifecycleAction(action: ArcAgreementPayerLifecycleAction | null) {
  if (!action) return null
  return {
    action: action.action,
    status: action.status,
    transactionHash: action.transactionHash ?? null,
    webhookPending: action.status === 'confirmed' && !action.webhookEventId,
  }
}

function publicDelivery(action: ArcAgreementOperatorAction | null) {
  if (!action || action.action !== 'release') return null
  return {
    id: action.id,
    step: action.step ?? 0,
    status: action.status,
    deliveryNote: action.deliveryNote ?? '',
    evidenceReference: action.evidenceReference,
    requestedAt: action.requestedAt,
    reviewedAt: action.reviewedAt,
    reviewNote: action.reviewNote,
    completedAt: action.completedAt,
    transactionHash: action.transactionHash ?? null,
    updatedAt: action.updatedAt,
  }
}

function currentReleaseAction(
  actions: ArcAgreementOperatorAction[],
  attempt: ArcAgreementActivationAttempt,
  agreement: ArcAgreement,
) {
  const releases = actions.filter(item => item.action === 'release')
  const nextStep = attempt.lifecycle?.nextStep
  if (attempt.lifecycle && attempt.lifecycle.status !== 'active') return null
  if (!Number.isInteger(nextStep)) return releases.find(item => item.status !== 'completed') ?? null
  const releaseSteps = agreement.template === 'milestone'
    ? agreement.milestones?.length ?? 0
    : agreement.template === 'progressive_release'
      ? agreement.checkpoints?.length ?? 0
      : 1
  if ((nextStep ?? 0) >= releaseSteps) return null
  return releases.find(item => item.step === nextStep) ?? null
}

function agentWalletId(identity: string) {
  return `agent_${arcAgreementPayerIdentityHash(identity).slice(0, 40)}`
}

function knownFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const explicit = Number((error as Error & { status?: number })?.status) || 0
  if (explicit >= 400 && explicit < 500) return { status: explicit, message }
  if (/not found for this project|Agreement not found/.test(message)) return { status: 404, message: 'Agreement not found.' }
  if (/requires|required|must|cannot|authenticated|not expected|not yet eligible|no longer eligible|already|does not match|disabled|allowlist|ceiling|limit|approval|prepare|transaction|payer call|native value|calldata|directly execute/i.test(message)) {
    return { status: 409, message }
  }
  return { status: 500, message: 'Arc Agreement agent service is temporarily unavailable.' }
}

export function createArcAgreementAgentHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function arcAgreementAgentHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    }
    try {
      const policy = requireAgentPolicy(await dependencies.policy(req))
      const agreementId = clean(req.body?.agreementId, 80)
      const action = clean(req.body?.action, 40)
      if (!/^agr_[a-z0-9]{12,64}$/i.test(agreementId) || !action) {
        throw fail('Agreement id and action are required.', 400)
      }
      const agreement = await dependencies.readAgreement(policy.partnerId, agreementId)
      if (!agreement || agreement.checkoutMode !== 'agentic') throw fail('Agreement not found.', 404)
      const identity = payerIdentity(policy, req.body?.payerReference)

      if (action === 'prepare') {
        const payer = payerAddress(req.body?.payerAddress)
        const prepared = await dependencies.prepareAttempt({
          policy,
          agreementId,
          draft: {
            clientReference: agreement.clientReference,
            termsHash: agreement.termsHash,
            chainTerms: agreement.chainTerms,
          },
          payer,
          payerIdentity: identity,
          payerSource: 'agent_request',
          env: dependencies.env(),
        })
        return res.status(prepared.replayed ? 200 : 201).json({
          ok: true,
          replayed: prepared.replayed,
          agreement: publicAgreement(agreement),
          attempt: publicAttempt(prepared.attempt),
        })
      }

      const attempt = await dependencies.readAttempt(policy, agreementId)
      if (attempt.checkoutMode !== 'agentic' || attempt.payerIdentityHash !== arcAgreementPayerIdentityHash(identity)) {
        throw fail('Agreement not found.', 404)
      }
      const payer = payerAddress(req.body?.payerAddress)
      if (attempt.prepared.payer !== payer) throw fail('Agreement not found.', 404)

      if (action === 'review') {
        const operatorActions = await dependencies.listOperatorActions({
          partnerId: policy.partnerId,
          agreementId,
          limit: 20,
        })
        let lifecycle = null
        if (attempt.status === 'active') {
          const reviewed = await dependencies.reviewLifecycle({
            client: dependencies.client(),
            partnerId: policy.partnerId,
            agreementId,
            payerIdentity: identity,
            walletId: agentWalletId(identity),
            walletAddress: payer,
            checkoutMode: 'agentic',
          })
          lifecycle = {
            available: true,
            enabled: String(dependencies.env().ARC_AGREEMENT_PAYER_LIFECYCLE_ENABLED ?? '').trim().toLowerCase() === 'true',
            cancel: reviewed.eligibility.cancel,
            refund: reviewed.eligibility.refund,
            action: publicLifecycleAction(reviewed.action),
          }
        }
        return res.json({
          ok: true,
          agreement: publicAgreement(agreement),
          attempt: publicAttempt(attempt),
          lifecycle,
          delivery: publicDelivery(currentReleaseAction(operatorActions, attempt, agreement)),
        })
      }

      if (action === 'status') {
        const reconciled = await dependencies.reconcileAttempt({
          client: dependencies.client(),
          policy,
          agreementId,
        })
        return res.json({
          ok: true,
          pending: reconciled.pending,
          changed: reconciled.changed,
          attempt: publicAttempt(reconciled.attempt),
        })
      }

      if (action === 'delivery-decision') {
        if (attempt.status !== 'active') throw fail('This agreement is not active.', 409)
        const deliveryId = clean(req.body?.deliveryId, 40)
        if (!/^opa_[a-f0-9]{24}$/.test(deliveryId)) throw fail('A valid delivery review id is required.', 400)
        const releases = await dependencies.listOperatorActions({ partnerId: policy.partnerId, agreementId, limit: 20 })
        const delivery = releases.find(item => item.action === 'release' && item.id === deliveryId)
        if (!delivery) throw fail('No delivery is ready for review.', 404)
        if (currentReleaseAction(releases, attempt, agreement)?.id !== delivery.id) {
          throw fail('This delivery is no longer the current milestone.', 409)
        }
        if (delivery.reviewPolicy !== 'payer') throw fail('This release uses the restricted operations review path.', 409)
        const lifecycle = await dependencies.reviewLifecycle({
          client: dependencies.client(),
          partnerId: policy.partnerId,
          agreementId,
          payerIdentity: identity,
          walletId: agentWalletId(identity),
          walletAddress: payer,
          checkoutMode: 'agentic',
        })
        if (lifecycle.eligibility.refund.eligible) throw fail('This agreement has ended. Return the remaining USDC.', 409)
        const decision = clean(req.body?.decision, 20)
        if (decision !== 'accept' && decision !== 'dispute') throw fail('Decision must be accept or dispute.', 400)
        if (delivery.status !== 'awaiting_review') {
          const accepted = ['queued', 'provider_pending', 'chain_pending', 'completed'].includes(delivery.status)
          if ((decision === 'accept' && accepted) || (decision === 'dispute' && delivery.status === 'disputed')) {
            return res.json({ ok: true, replayed: true, delivery: publicDelivery(delivery) })
          }
          throw fail('This delivery decision has already been recorded.', 409)
        }
        const decided = decision === 'accept'
          ? await dependencies.approveOperatorAction({
              actionId: delivery.id,
              requestHash: delivery.requestHash,
              reviewedBy: identity,
              reviewNote: 'Agent payer accepted the submitted delivery.',
              authoritativeNextStep: attempt.lifecycle?.nextStep,
              requesterReviewAuthorized: true,
            })
          : await dependencies.disputeOperatorAction({
              actionId: delivery.id,
              requestHash: delivery.requestHash,
              reviewedBy: identity,
              reviewNote: clean(req.body?.issue, 300),
              requesterReviewAuthorized: true,
            })
        return res.json({ ok: true, replayed: false, delivery: publicDelivery(decided) })
      }

      if (action === 'lifecycle-status') {
        const result = await dependencies.reconcileLifecycle({
          client: dependencies.client(),
          partnerId: policy.partnerId,
          agreementId,
          payerIdentity: identity,
        })
        return res.json({
          ok: true,
          pending: result.pending,
          changed: result.changed,
          lifecycleAction: publicLifecycleAction(result.action),
        })
      }

      if (action === 'lifecycle-prepare-call') {
        if (attempt.status !== 'active') throw fail('This agreement is not active.', 409)
        const lifecycleAction = clean(req.body?.lifecycleAction, 20)
        if (lifecycleAction !== 'cancel' && lifecycleAction !== 'refund') {
          throw fail('Lifecycle action must be cancel or refund.', 400)
        }
        const prepared = await dependencies.prepareLifecycleCall({
          client: dependencies.client(),
          partnerId: policy.partnerId,
          agreementId,
          payerIdentity: identity,
          walletAddress: payer,
          action: lifecycleAction,
          env: dependencies.env(),
        })
        return res.json({
          ok: true,
          replayed: prepared.replayed,
          lifecycleAction: publicLifecycleAction(prepared.action),
          call: prepared.call,
        })
      }

      if (action === 'lifecycle-circle-execute') {
        if (attempt.status !== 'active') throw fail('This agreement is not active.', 409)
        const lifecycleAction = clean(req.body?.lifecycleAction, 20)
        if (lifecycleAction !== 'cancel' && lifecycleAction !== 'refund') {
          throw fail('Lifecycle action must be cancel or refund.', 400)
        }
        const prepared = await dependencies.prepareLifecycleCall({
          client: dependencies.client(),
          partnerId: policy.partnerId,
          agreementId,
          payerIdentity: identity,
          walletAddress: payer,
          action: lifecycleAction,
          env: dependencies.env(),
        })
        const executed = await executePreparedCircleCall({
          req,
          dependencies,
          policy,
          agreementId,
          operation: `lifecycle:${lifecycleAction}`,
          payer,
          call: prepared.call,
          record: transactionHash => dependencies.recordLifecycleTransaction({
            client: dependencies.client(),
            partnerId: policy.partnerId,
            agreementId,
            payerIdentity: identity,
            transactionHash,
            requireAgentPreparation: true,
            directOnly: true,
          }),
        })
        const recorded = executed.recorded
        return res.status(202).json({
          ok: true,
          replayed: executed.replayed || recorded?.replayed === true,
          pending: true,
          transactionHash: executed.transactionHash,
          lifecycleAction: publicLifecycleAction(recorded?.action ?? prepared.action),
        })
      }

      if (action === 'lifecycle-record') {
        const recorded = await dependencies.recordLifecycleTransaction({
          client: dependencies.client(),
          partnerId: policy.partnerId,
          agreementId,
          payerIdentity: identity,
          transactionHash: clean(req.body?.transactionHash, 80),
          requireAgentPreparation: true,
          directOnly: true,
        })
        return res.status(recorded.replayed ? 200 : 202).json({
          ok: true,
          replayed: recorded.replayed,
          pending: true,
          lifecycleAction: publicLifecycleAction(recorded.action),
        })
      }

      const stage = clean(req.body?.stage, 20)
      if (stage !== 'approval' && stage !== 'activation') {
        throw fail('Stage must be approval or activation.', 400)
      }

      if (action === 'prepare-call') {
        const prepared = await dependencies.prepareCall({
          policy,
          agreementId,
          payer,
          payerIdentity: identity,
          stage,
          env: dependencies.env(),
        })
        return res.json({
          ok: true,
          replayed: prepared.replayed,
          stage,
          call: prepared.call,
          attempt: publicAttempt(prepared.attempt),
        })
      }

      if (action === 'circle-execute') {
        const prepared = await dependencies.prepareCall({
          policy,
          agreementId,
          payer,
          payerIdentity: identity,
          stage,
          env: dependencies.env(),
        })
        const executed = await executePreparedCircleCall({
          req,
          dependencies,
          policy,
          agreementId,
          operation: stage,
          payer,
          call: prepared.call,
          record: transactionHash => dependencies.recordTransaction({
            client: dependencies.client(),
            policy,
            agreementId,
            payer,
            payerIdentity: identity,
            stage,
            transactionHash,
            requireAgentPreparation: true,
            directOnly: true,
            env: dependencies.env(),
          }),
        })
        return res.status(202).json({
          ok: true,
          replayed: executed.replayed || executed.recorded?.replayed === true,
          pending: true,
          stage,
          transactionHash: executed.transactionHash,
          attempt: publicAttempt(executed.recorded?.attempt ?? prepared.attempt),
        })
      }

      if (action === 'record') {
        const recorded = await dependencies.recordTransaction({
          client: dependencies.client(),
          policy,
          agreementId,
          payer,
          payerIdentity: identity,
          stage,
          transactionHash: clean(req.body?.transactionHash, 80),
          requireAgentPreparation: true,
          directOnly: true,
          env: dependencies.env(),
        })
        return res.status(recorded.replayed ? 200 : 202).json({
          ok: true,
          replayed: recorded.replayed,
          pending: true,
          attempt: publicAttempt(recorded.attempt),
        })
      }

      throw fail('Unknown Arc Agreement agent action.', 400)
    } catch (error) {
      const failure = knownFailure(error)
      if (failure.status >= 500) dependencies.logError(error instanceof Error ? error.message : String(error))
      return res.status(failure.status).json({ ok: false, error: failure.message })
    }
  }
}

export default createArcAgreementAgentHandler()
