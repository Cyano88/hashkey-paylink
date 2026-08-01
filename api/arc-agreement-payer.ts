import type { Request, Response } from 'express'
import {
  getAddress,
  isAddress,
} from 'viem'
import {
  arcAgreementPayerIdentityHash,
  attachArcAgreementPayerChallenge,
  latestArcAgreementPayerChallenge,
  markArcAgreementPayerChallengeRecorded,
  observeArcAgreementPayerChallenge,
  prepareArcAgreementActivationAttempt,
  prepareArcAgreementPayerChallenge,
  readArcAgreementActivationAttemptRecord,
  readArcAgreementActivationAttempt,
  recordArcAgreementPayerTransaction,
  reconcileArcAgreementActivationAttempt,
  reserveArcAgreementPayerChallenge,
  type ArcAgreementActivationAttempt,
  type ArcAgreementActivationClient,
} from './arc-agreement-activation-attempts.js'
import { createArcAgreementActivationClient } from './arc-agreement-activation-client.js'
import {
  readArcAgreementByPayerAccess,
  type ArcAgreement,
} from './arc-agreements.js'
import {
  resolveDeveloperProjectPolicy,
  type DeveloperCheckoutPolicy,
} from './developer-projects.js'
import {
  circleLinkKey,
  readCircleLink,
  verifiedPrivyUser,
  verifyCircleLinkWallet,
  type CircleLinkRecord,
  type VerifiedLinkUser,
} from './privy-circle-link.js'
import {
  createCircleArcUserContractChallenge,
  readCircleArcUserChallenge,
  readCircleArcUserTransaction,
} from './circle-solana-email.js'
import {
  attachArcAgreementPayerLifecycleChallenge,
  observeArcAgreementPayerLifecycleAction,
  readArcAgreementPayerLifecycleAction,
  reconcileArcAgreementPayerLifecycleAction,
  recordArcAgreementPayerLifecycleTransaction,
  reserveArcAgreementPayerLifecycleAction,
  reviewArcAgreementPayerLifecycle,
  type ArcAgreementPayerLifecycleAction,
  type ArcAgreementPayerLifecycleActionName,
} from './arc-agreement-payer-lifecycle.js'
import {
  approveArcAgreementOperatorAction,
  disputeArcAgreementOperatorAction,
  listArcAgreementOperatorActions,
  type ArcAgreementOperatorAction,
} from './arc-agreement-operator-actions.js'

type Dependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  readAgreement(id: string, accessToken: string): Promise<ArcAgreement | null>
  resolvePolicy(projectId: string): Promise<DeveloperCheckoutPolicy | null>
  readLink(key: string): Promise<CircleLinkRecord | null>
  verifyWallet(input: {
    userToken: string
    chain: 'arc'
    wallet: { id: string; address: string; blockchain: string }
  }): Promise<void>
  prepareAttempt: typeof prepareArcAgreementActivationAttempt
  readAttempt: typeof readArcAgreementActivationAttempt
  readAttemptRecord: typeof readArcAgreementActivationAttemptRecord
  prepareChallenge: typeof prepareArcAgreementPayerChallenge
  reserveChallenge: typeof reserveArcAgreementPayerChallenge
  attachChallenge: typeof attachArcAgreementPayerChallenge
  observeChallenge: typeof observeArcAgreementPayerChallenge
  markChallengeRecorded: typeof markArcAgreementPayerChallengeRecorded
  recordTransaction: typeof recordArcAgreementPayerTransaction
  reconcileAttempt: typeof reconcileArcAgreementActivationAttempt
  createChallenge: typeof createCircleArcUserContractChallenge
  readChallenge: typeof readCircleArcUserChallenge
  readTransaction: typeof readCircleArcUserTransaction
  reviewLifecycle: typeof reviewArcAgreementPayerLifecycle
  reserveLifecycle: typeof reserveArcAgreementPayerLifecycleAction
  readLifecycle: typeof readArcAgreementPayerLifecycleAction
  attachLifecycle: typeof attachArcAgreementPayerLifecycleChallenge
  observeLifecycle: typeof observeArcAgreementPayerLifecycleAction
  recordLifecycle: typeof recordArcAgreementPayerLifecycleTransaction
  reconcileLifecycle: typeof reconcileArcAgreementPayerLifecycleAction
  listOperatorActions: typeof listArcAgreementOperatorActions
  approveOperatorAction: typeof approveArcAgreementOperatorAction
  disputeOperatorAction: typeof disputeArcAgreementOperatorAction
  client(): ArcAgreementActivationClient
  env(): NodeJS.ProcessEnv
}

const defaults: Dependencies = {
  verifyUser: verifiedPrivyUser,
  readAgreement: readArcAgreementByPayerAccess,
  resolvePolicy: projectId => resolveDeveloperProjectPolicy(projectId, 'test'),
  readLink: readCircleLink,
  verifyWallet: verifyCircleLinkWallet,
  prepareAttempt: prepareArcAgreementActivationAttempt,
  readAttempt: readArcAgreementActivationAttempt,
  readAttemptRecord: readArcAgreementActivationAttemptRecord,
  prepareChallenge: prepareArcAgreementPayerChallenge,
  reserveChallenge: reserveArcAgreementPayerChallenge,
  attachChallenge: attachArcAgreementPayerChallenge,
  observeChallenge: observeArcAgreementPayerChallenge,
  markChallengeRecorded: markArcAgreementPayerChallengeRecorded,
  recordTransaction: recordArcAgreementPayerTransaction,
  reconcileAttempt: reconcileArcAgreementActivationAttempt,
  createChallenge: createCircleArcUserContractChallenge,
  readChallenge: readCircleArcUserChallenge,
  readTransaction: readCircleArcUserTransaction,
  reviewLifecycle: reviewArcAgreementPayerLifecycle,
  reserveLifecycle: reserveArcAgreementPayerLifecycleAction,
  readLifecycle: readArcAgreementPayerLifecycleAction,
  attachLifecycle: attachArcAgreementPayerLifecycleChallenge,
  observeLifecycle: observeArcAgreementPayerLifecycleAction,
  recordLifecycle: recordArcAgreementPayerLifecycleTransaction,
  reconcileLifecycle: reconcileArcAgreementPayerLifecycleAction,
  listOperatorActions: listArcAgreementOperatorActions,
  approveOperatorAction: approveArcAgreementOperatorAction,
  disputeOperatorAction: disputeArcAgreementOperatorAction,
  client: createArcAgreementActivationClient,
  env: () => process.env,
}

function clean(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max)
}

function fail(message: string, status: number) {
  const error = new Error(message) as Error & { status?: number }
  error.status = status
  return error
}

function accessToken(req: Request) {
  return clean(req.headers['x-arc-agreement-access'], 160)
}

function payerIdentity(userId: string) {
  return `privy:${userId}`
}

function publicAgreement(agreement: ArcAgreement) {
  const {
    requestHash: _requestHash,
    payerAccessHash: _payerAccessHash,
    ...record
  } = agreement
  return record
}

function publicAttempt(attempt: ArcAgreementActivationAttempt) {
  const {
    payerIdentityHash: _payerIdentityHash,
    challenges: _challenges,
    ...record
  } = attempt
  return record
}

function publicRecovery(attempt: ArcAgreementActivationAttempt | null) {
  if (!attempt) return null
  const stage: 'approval' | 'activation' | null = attempt.status === 'awaiting_approval' || attempt.status === 'approval_failed'
    ? 'approval'
    : attempt.status === 'ready_to_activate' || attempt.status === 'activation_failed'
      ? 'activation'
      : null
  if (!stage) return null
  const challenge = latestArcAgreementPayerChallenge(attempt, stage)
  if (!challenge || !['reserved', 'issued', 'transaction_pending', 'manual_review'].includes(challenge.status)) {
    return null
  }
  return {
    stage,
    pending: true,
    chainSubmitted: Boolean(challenge.transactionHash),
  }
}

function publicLifecycleAction(action: ArcAgreementPayerLifecycleAction | null) {
  if (!action) return null
  return {
    action: action.action,
    status: action.status,
    transactionHash: action.transactionHash ?? null,
    webhookPending: action.status === 'confirmed' && !action.webhookEventId,
    retryable: action.status === 'provider_failed'
      && !action.providerTransactionId
      && !action.transactionHash,
  }
}

function publicDelivery(action: ArcAgreementOperatorAction | null) {
  if (!action || action.action !== 'release') return null
  return {
    id: action.id,
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

function lifecycleActionName(value: unknown): ArcAgreementPayerLifecycleActionName {
  const action = clean(value, 20)
  if (action !== 'cancel' && action !== 'refund') {
    throw fail('Lifecycle action must be cancel or refund.', 400)
  }
  return action
}

function linkedArcWallet(link: CircleLinkRecord | null, identity: VerifiedLinkUser) {
  if (
    !link
    || link.privyUserId !== identity.userId
    || link.chain !== 'arc'
    || (link.purpose ?? 'payment') !== 'payment'
    || link.circleBlockchain !== 'ARC-TESTNET'
    || !isAddress(link.circleWalletAddress)
  ) {
    return null
  }
  return {
    id: link.circleWalletId,
    address: getAddress(link.circleWalletAddress),
    blockchain: link.circleBlockchain,
  }
}

function requireLinkedArcWallet(link: CircleLinkRecord | null, identity: VerifiedLinkUser) {
  const wallet = linkedArcWallet(link, identity)
  if (!wallet) throw fail('Connect and verify your Circle Arc wallet before continuing.', 409)
  return wallet
}

function providerTransactionId(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  const direct = record.transactionId ?? record.transactionID
  if (typeof direct === 'string' && direct) return direct
  const correlationIds = record.correlationIds
  if (Array.isArray(correlationIds) && typeof correlationIds[0] === 'string') return correlationIds[0]
  for (const nested of Object.values(record)) {
    if (nested && typeof nested === 'object') {
      const found = providerTransactionId(nested)
      if (found) return found
    }
  }
  return ''
}

function providerTransactionHash(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  const direct = record.txHash ?? record.transactionHash ?? record.tx_hash
  if (typeof direct === 'string' && /^0x[0-9a-f]{64}$/i.test(direct)) return direct
  for (const nested of Object.values(record)) {
    if (nested && typeof nested === 'object') {
      const found = providerTransactionHash(nested)
      if (found) return found
    }
  }
  return ''
}

function providerState(value: unknown) {
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  return clean(record.state ?? record.status, 40).toUpperCase()
}

const PROVIDER_FAILURES = new Set(['CANCELLED', 'DENIED', 'EXPIRED', 'FAILED'])
const PAYER_POLICY_CONFLICTS = [
  'Arc Agreement activation is disabled.',
  'This developer project has reached its active Arc Agreement limit.',
  'This developer project has reached its Arc Agreement daily-volume limit.',
  'Agreement amount exceeds the configured testnet activation ceiling.',
  'Agreement duration exceeds the configured testnet activation ceiling.',
]

function payerFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const explicitStatus = Number((error as Error & { status?: number })?.status) || 0
  if (explicitStatus) return { status: explicitStatus, message }
  if (PAYER_POLICY_CONFLICTS.includes(message)) {
    return {
      status: 409,
      message: message === 'Arc Agreement activation is disabled.'
        ? 'Agreement activation is currently paused.'
        : message,
    }
  }
  return { status: 500, message: 'Arc Agreement payer service is temporarily unavailable.' }
}

async function existingAttempt(
  dependencies: Dependencies,
  policy: DeveloperCheckoutPolicy,
  agreementId: string,
) {
  try {
    return await dependencies.readAttempt(policy, agreementId)
  } catch (error) {
    if ((error as Error).message.includes('was not found for this project')) return null
    throw error
  }
}

export function createArcAgreementPayerHandler(dependencies: Dependencies = defaults) {
  return async function arcAgreementPayerHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    try {
      const agreementId = clean(req.body?.agreementId, 80)
      const action = clean(req.body?.action, 40)
      const capability = accessToken(req)
      if (!agreementId || !action || !capability) {
        throw fail('Agreement id, payer access, and action are required.', 400)
      }
      const agreement = await dependencies.readAgreement(agreementId, capability)
      if (!agreement) throw fail('Agreement payer access is invalid or expired.', 404)
      if (agreement.checkoutMode !== 'human') {
        throw fail('Agentic agreements require the dedicated agent activation flow.', 409)
      }
      const identity = await dependencies.verifyUser(req)
      const identityValue = payerIdentity(identity.userId)
      const linkRecord = await dependencies.readLink(circleLinkKey(identity.userId, 'arc', 'payment'))
      const policy = await dependencies.resolvePolicy(agreement.partnerId)
      const currentPolicy = policy?.partnerId === agreement.partnerId && policy.checkoutMode === agreement.checkoutMode
        ? policy
        : null
      let knownAttempt: ArcAgreementActivationAttempt | null = null
      if (currentPolicy) {
        knownAttempt = await existingAttempt(dependencies, currentPolicy, agreement.id)
      } else {
        try {
          knownAttempt = await dependencies.readAttemptRecord(agreement.partnerId, agreement.id)
        } catch (error) {
          if (!(error as Error).message.includes('was not found for this project')) throw error
        }
      }
      if (
        knownAttempt
        && knownAttempt.payerIdentityHash !== arcAgreementPayerIdentityHash(identityValue)
      ) {
        throw fail('This agreement is bound to another authenticated payer.', 403)
      }

      if (action === 'review') {
        const linkedWallet = linkedArcWallet(linkRecord, identity)
        const deliveryAction = knownAttempt
          ? (await dependencies.listOperatorActions({
              partnerId: agreement.partnerId,
              agreementId: agreement.id,
              limit: 20,
            })).find(item => item.action === 'release') ?? null
          : null
        let lifecycle: {
          available: boolean
          enabled?: boolean
          cancel?: { eligible: boolean; reason: string | null }
          refund?: { eligible: boolean; reason: string | null }
          action?: ReturnType<typeof publicLifecycleAction>
        } | null = null
        if (knownAttempt?.status === 'active' && linkedWallet) {
          try {
            const lifecycleReview = await dependencies.reviewLifecycle({
              client: dependencies.client(),
              partnerId: agreement.partnerId,
              agreementId: agreement.id,
              payerIdentity: identityValue,
              walletId: linkedWallet.id,
              walletAddress: linkedWallet.address,
            })
            let lifecycleAction = lifecycleReview.action
            if (lifecycleAction?.status === 'confirmed' && !lifecycleAction.webhookEventId) {
              try {
                const backfill = await dependencies.reconcileLifecycle({
                  client: dependencies.client(),
                  partnerId: agreement.partnerId,
                  agreementId: agreement.id,
                  payerIdentity: identityValue,
                })
                lifecycleAction = backfill.action ?? lifecycleAction
              } catch {
                // Preserve the confirmed payer UI; a later review safely retries
                // the stable, duplicate-suppressed terminal webhook backfill.
              }
            }
            lifecycle = {
              available: true,
              enabled: String(dependencies.env().ARC_AGREEMENT_PAYER_LIFECYCLE_ENABLED ?? '').trim().toLowerCase() === 'true',
              cancel: lifecycleReview.eligibility.cancel,
              refund: lifecycleReview.eligibility.refund,
              action: publicLifecycleAction(lifecycleAction),
            }
          } catch {
            lifecycle = { available: false }
          }
        }
        return res.json({
          ok: true,
          agreement: publicAgreement(agreement),
          payer: {
            walletLinked: Boolean(linkedWallet),
            walletAddress: linkedWallet?.address ?? null,
            network: 'arc',
          },
          attempt: knownAttempt ? publicAttempt(knownAttempt) : null,
          recovery: publicRecovery(knownAttempt),
          lifecycle,
          delivery: publicDelivery(deliveryAction),
        })
      }

      if (action === 'delivery-decision') {
        if (knownAttempt?.status !== 'active') {
          throw fail('This agreement is not active.', 409)
        }
        requireLinkedArcWallet(linkRecord, identity)
        const deliveryAction = (await dependencies.listOperatorActions({
          partnerId: agreement.partnerId,
          agreementId: agreement.id,
          limit: 20,
        })).find(item => item.action === 'release')
        if (!deliveryAction) throw fail('No delivery is ready for review.', 404)
        if (deliveryAction.reviewPolicy !== 'payer') {
          throw fail('This release uses the restricted operations review path.', 409)
        }
        const decision = clean(req.body?.decision, 20)
        if (decision !== 'accept' && decision !== 'dispute') {
          throw fail('Choose release payment or report an issue.', 400)
        }
        if (deliveryAction.status !== 'awaiting_review') {
          const accepted = ['queued', 'provider_pending', 'chain_pending', 'completed'].includes(deliveryAction.status)
          const disputed = deliveryAction.status === 'disputed'
          if ((decision === 'accept' && accepted) || (decision === 'dispute' && disputed)) {
            return res.json({ ok: true, replayed: true, delivery: publicDelivery(deliveryAction) })
          }
          throw fail('This delivery decision has already been recorded.', 409)
        }
        const decided = decision === 'accept'
          ? await dependencies.approveOperatorAction({
              actionId: deliveryAction.id,
              requestHash: deliveryAction.requestHash,
              reviewedBy: identity.userId,
              reviewNote: 'Payer accepted the submitted delivery.',
            })
          : await dependencies.disputeOperatorAction({
              actionId: deliveryAction.id,
              requestHash: deliveryAction.requestHash,
              reviewedBy: identity.userId,
              reviewNote: clean(req.body?.issue, 300),
            })
        return res.json({ ok: true, replayed: false, delivery: publicDelivery(decided) })
      }

      const link = requireLinkedArcWallet(linkRecord, identity)

      if (action === 'status') {
        if (!knownAttempt) throw fail('Prepare this agreement before checking activation status.', 409)
        const recovery = publicRecovery(knownAttempt)
        if (recovery?.chainSubmitted) {
          const challenge = latestArcAgreementPayerChallenge(knownAttempt, recovery.stage)
          if (!challenge?.transactionHash) {
            throw new Error('The durable Arc transaction hash is unavailable for recovery.')
          }
          const recorded = await dependencies.recordTransaction({
            client: dependencies.client(),
            policy: { partnerId: agreement.partnerId },
            agreementId: agreement.id,
            payer: link.address,
            stage: recovery.stage,
            transactionHash: challenge.transactionHash,
            recoverSubmittedChallenge: true,
            env: dependencies.env(),
          })
          knownAttempt = recorded.attempt
          await dependencies.markChallengeRecorded({
            policy: { partnerId: agreement.partnerId },
            agreementId: agreement.id,
            payerIdentity: identityValue,
            stage: recovery.stage,
            challengeId: challenge.challengeId ?? '',
            transactionHash: challenge.transactionHash,
          })
        }
        const result = await dependencies.reconcileAttempt({
          client: dependencies.client(),
          policy: { partnerId: agreement.partnerId },
          agreementId: agreement.id,
        })
        return res.json({
          ok: true,
          pending: result.pending,
          changed: result.changed,
          attempt: publicAttempt(result.attempt),
        })
      }

      if (action === 'lifecycle-status') {
        const result = await dependencies.reconcileLifecycle({
          client: dependencies.client(),
          partnerId: agreement.partnerId,
          agreementId: agreement.id,
          payerIdentity: identityValue,
        })
        return res.json({
          ok: true,
          pending: result.pending,
          changed: result.changed,
          lifecycleAction: publicLifecycleAction(result.action),
        })
      }

      const circleUserToken = clean(req.body?.circleUserToken, 8_000)
      if (!circleUserToken) throw fail('A fresh Circle wallet session is required.', 401)
      await dependencies.verifyWallet({
        userToken: circleUserToken,
        chain: 'arc',
        wallet: link,
      })

      if (action === 'prepare') {
        if (!currentPolicy) {
          throw fail('This developer project is not currently eligible for new Arc Agreement activation.', 409)
        }
        const result = await dependencies.prepareAttempt({
          policy: currentPolicy,
          agreementId: agreement.id,
          draft: {
            clientReference: agreement.clientReference,
            termsHash: agreement.termsHash,
            chainTerms: agreement.chainTerms,
          },
          payer: link.address,
          payerIdentity: identityValue,
          env: dependencies.env(),
        })
        return res.status(result.replayed ? 200 : 201).json({
          ok: true,
          replayed: result.replayed,
          attempt: publicAttempt(result.attempt),
        })
      }

      if (action === 'lifecycle-challenge') {
        const lifecycleAction = lifecycleActionName(req.body?.lifecycleAction)
        const reservation = await dependencies.reserveLifecycle({
          client: dependencies.client(),
          partnerId: agreement.partnerId,
          agreementId: agreement.id,
          payerIdentity: identityValue,
          walletId: link.id,
          walletAddress: link.address,
          action: lifecycleAction,
          env: dependencies.env(),
        })
        let journal = reservation.action
        if (!journal.challengeId) {
          const challenge = await dependencies.createChallenge({
            userToken: circleUserToken,
            walletId: link.id,
            walletAddress: link.address,
            callData: reservation.call.data,
            idempotencyKey: journal.idempotencyKey,
            refId: `arc-agreement:${agreement.id}:${lifecycleAction}:${journal.sequence}`,
          })
          const challengeId = clean(challenge.challengeId, 256)
          if (!challengeId) throw fail('Circle did not return a payer confirmation challenge.', 503)
          journal = await dependencies.attachLifecycle({
            partnerId: agreement.partnerId,
            agreementId: agreement.id,
            payerIdentity: identityValue,
            challengeId,
            providerTransactionId: providerTransactionId(challenge) || undefined,
          })
        }
        if (!journal.challengeId) throw fail('Circle did not return a payer confirmation challenge.', 503)
        return res.json({
          ok: true,
          lifecycleAction,
          challengeId: journal.challengeId,
          replayed: reservation.replayed,
        })
      }

      if (action === 'lifecycle-recover') {
        const journal = await dependencies.readLifecycle({
          partnerId: agreement.partnerId,
          agreementId: agreement.id,
          payerIdentity: identityValue,
        })
        if (!journal?.challengeId) throw fail('No Circle lifecycle confirmation is available to recover.', 409)
        const challenge = await dependencies.readChallenge({
          userToken: circleUserToken,
          challengeId: journal.challengeId,
        })
        const challengeState = providerState(challenge)
        const transactionId = journal.providerTransactionId || providerTransactionId(challenge)
        if (!transactionId) {
          const failed = PROVIDER_FAILURES.has(challengeState)
          const observed = await dependencies.observeLifecycle({
            partnerId: agreement.partnerId,
            agreementId: agreement.id,
            payerIdentity: identityValue,
            providerState: challengeState,
            status: failed ? 'provider_failed' : 'issued',
          })
          if (failed) throw fail('The Circle confirmation expired or was cancelled. Start again.', 409)
          return res.json({
            ok: true,
            pending: true,
            lifecycleAction: publicLifecycleAction(observed),
          })
        }
        const transaction = await dependencies.readTransaction({
          userToken: circleUserToken,
          transactionId,
        })
        const transactionState = providerState(transaction)
        const transactionHash = providerTransactionHash(transaction)
        if (PROVIDER_FAILURES.has(transactionState)) {
          await dependencies.observeLifecycle({
            partnerId: agreement.partnerId,
            agreementId: agreement.id,
            payerIdentity: identityValue,
            providerTransactionId: transactionId,
            providerState: transactionState,
            status: 'provider_failed',
          })
          throw fail('The Circle transaction failed or was cancelled. Start again.', 409)
        }
        const observed = await dependencies.observeLifecycle({
          partnerId: agreement.partnerId,
          agreementId: agreement.id,
          payerIdentity: identityValue,
          providerTransactionId: transactionId,
          transactionHash: transactionHash || undefined,
          providerState: transactionState,
          status: 'transaction_pending',
        })
        if (!transactionHash) {
          return res.json({
            ok: true,
            pending: true,
            lifecycleAction: publicLifecycleAction(observed),
          })
        }
        const recorded = await dependencies.recordLifecycle({
          client: dependencies.client(),
          partnerId: agreement.partnerId,
          agreementId: agreement.id,
          payerIdentity: identityValue,
          transactionHash,
        })
        return res.status(recorded.replayed ? 200 : 202).json({
          ok: true,
          pending: true,
          recovered: true,
          lifecycleAction: publicLifecycleAction(recorded.action),
        })
      }

      if (action === 'lifecycle-record') {
        const recorded = await dependencies.recordLifecycle({
          client: dependencies.client(),
          partnerId: agreement.partnerId,
          agreementId: agreement.id,
          payerIdentity: identityValue,
          transactionHash: clean(req.body?.transactionHash, 80),
        })
        return res.status(recorded.replayed ? 200 : 202).json({
          ok: true,
          pending: true,
          lifecycleAction: publicLifecycleAction(recorded.action),
        })
      }

      const stage = clean(req.body?.stage, 20)
      if (stage !== 'approval' && stage !== 'activation') {
        throw fail('Stage must be approval or activation.', 400)
      }

      if (action === 'challenge') {
        if (!currentPolicy) {
          throw fail('This developer project is not currently eligible for new Arc Agreement activation.', 409)
        }
        const reservation = await dependencies.reserveChallenge({
          policy: currentPolicy,
          agreementId: agreement.id,
          payerIdentity: identityValue,
          stage,
          walletId: link.id,
          walletAddress: link.address,
          env: dependencies.env(),
        })
        // Activation reservation renews its absolute Arc timestamps. Prepare
        // the Circle call only after that durable commitment is reserved.
        const prepared = await dependencies.prepareChallenge({
          policy: currentPolicy,
          agreementId: agreement.id,
          payerIdentity: identityValue,
          stage,
          env: dependencies.env(),
        })
        let journal = reservation.challenge
        if (!journal.challengeId) {
          const challenge = await dependencies.createChallenge({
            userToken: circleUserToken,
            walletId: link.id,
            walletAddress: link.address,
            callData: prepared.call.data,
            idempotencyKey: journal.idempotencyKey,
            refId: `arc-agreement:${agreement.id}:${stage}:${journal.sequence}`,
          })
          const challengeId = clean(challenge.challengeId, 256)
          if (!challengeId) throw fail('Circle did not return a payer confirmation challenge.', 503)
          const attached = await dependencies.attachChallenge({
            policy: currentPolicy,
            agreementId: agreement.id,
            payerIdentity: identityValue,
            idempotencyKey: journal.idempotencyKey,
            challengeId,
            providerTransactionId: providerTransactionId(challenge) || undefined,
          })
          journal = attached.challenge
        }
        const challengeId = clean(journal.challengeId, 256)
        if (!challengeId) throw fail('Circle did not return a payer confirmation challenge.', 503)
        return res.json({
          ok: true,
          stage,
          challengeId,
          idempotencyKey: journal.idempotencyKey,
          replayed: reservation.replayed,
          attempt: publicAttempt(reservation.attempt),
        })
      }

      if (action === 'recover') {
        if (!currentPolicy) {
          throw fail('This developer project is not currently eligible for activation recovery here.', 409)
        }
        if (!knownAttempt) throw fail('Prepare this agreement before recovering a Circle confirmation.', 409)
        const journal = latestArcAgreementPayerChallenge(knownAttempt, stage)
        if (!journal?.challengeId) throw fail('No Circle confirmation is available to recover.', 409)
        const challenge = await dependencies.readChallenge({
          userToken: circleUserToken,
          challengeId: journal.challengeId,
        })
        const challengeState = providerState(challenge)
        const transactionId = journal.providerTransactionId || providerTransactionId(challenge)
        if (!transactionId) {
          const failed = PROVIDER_FAILURES.has(challengeState)
          await dependencies.observeChallenge({
            policy: currentPolicy,
            agreementId: agreement.id,
            payerIdentity: identityValue,
            stage,
            challengeId: journal.challengeId,
            providerState: challengeState,
            status: failed ? 'provider_failed' : 'issued',
          })
          if (failed) throw fail('The Circle confirmation expired or was cancelled. Start a new confirmation.', 409)
          return res.json({ ok: true, pending: true, attempt: publicAttempt(knownAttempt) })
        }
        const transaction = await dependencies.readTransaction({
          userToken: circleUserToken,
          transactionId,
        })
        const transactionState = providerState(transaction)
        const transactionHash = providerTransactionHash(transaction)
        if (PROVIDER_FAILURES.has(transactionState)) {
          await dependencies.observeChallenge({
            policy: currentPolicy,
            agreementId: agreement.id,
            payerIdentity: identityValue,
            stage,
            challengeId: journal.challengeId,
            providerTransactionId: transactionId,
            providerState: transactionState,
            status: 'provider_failed',
          })
          throw fail('The Circle transaction failed or was cancelled. Start a new confirmation.', 409)
        }
        await dependencies.observeChallenge({
          policy: currentPolicy,
          agreementId: agreement.id,
          payerIdentity: identityValue,
          stage,
          challengeId: journal.challengeId,
          providerTransactionId: transactionId,
          transactionHash: transactionHash || undefined,
          providerState: transactionState,
          status: 'transaction_pending',
        })
        if (!transactionHash) {
          return res.json({ ok: true, pending: true, attempt: publicAttempt(knownAttempt) })
        }
        const recorded = await dependencies.recordTransaction({
          client: dependencies.client(),
          policy: currentPolicy,
          agreementId: agreement.id,
          payer: link.address,
          stage,
          transactionHash,
          env: dependencies.env(),
        })
        await dependencies.markChallengeRecorded({
          policy: currentPolicy,
          agreementId: agreement.id,
          payerIdentity: identityValue,
          stage,
          challengeId: journal.challengeId,
          transactionHash,
        })
        return res.status(recorded.replayed ? 200 : 202).json({
          ok: true,
          pending: true,
          recovered: true,
          attempt: publicAttempt(recorded.attempt),
        })
      }

      if (action === 'record') {
        if (!currentPolicy) {
          throw fail('This developer project is not currently eligible for activation recovery here.', 409)
        }
        if (!knownAttempt) throw fail('Prepare this agreement before recording a Circle confirmation.', 409)
        const journal = latestArcAgreementPayerChallenge(knownAttempt, stage)
        if (!journal?.challengeId) throw fail('No durable Circle confirmation exists for this payer action.', 409)
        const transactionHash = clean(req.body?.transactionHash, 80)
        const result = await dependencies.recordTransaction({
          client: dependencies.client(),
          policy: currentPolicy,
          agreementId: agreement.id,
          payer: link.address,
          stage,
          transactionHash,
          env: dependencies.env(),
        })
        await dependencies.markChallengeRecorded({
          policy: currentPolicy,
          agreementId: agreement.id,
          payerIdentity: identityValue,
          stage,
          challengeId: journal.challengeId,
          transactionHash,
        })
        return res.status(result.replayed ? 200 : 202).json({
          ok: true,
          replayed: result.replayed,
          attempt: publicAttempt(result.attempt),
        })
      }

      throw fail('Unknown Arc Agreement payer action.', 400)
    } catch (error) {
      const failure = payerFailure(error)
      const status = failure.status
      if (status >= 500) {
        console.error('[arc-agreement-payer] request failed:', error instanceof Error ? error.message : String(error))
      }
      return res.status(status).json({
        ok: false,
        error: failure.message,
      })
    }
  }
}

export default createArcAgreementPayerHandler()
