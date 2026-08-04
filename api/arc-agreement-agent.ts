import type { Request, Response } from 'express'
import { getAddress, isAddress } from 'viem'
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
