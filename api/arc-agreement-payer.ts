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
  listArcAgreementActivationAttemptRecords,
  recordArcAgreementPayerTransaction,
  reconcileArcAgreementActivationAttempt,
  reserveArcAgreementPayerChallenge,
  type ArcAgreementActivationAttempt,
  type ArcAgreementActivationClient,
} from './arc-agreement-activation-attempts.js'
import { createArcAgreementActivationClient } from './arc-agreement-activation-client.js'
import {
  readArcAgreementByPayerAccess,
  rotateArcAgreementPayerAccess,
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
  writeCircleLink,
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
import { createArcAgreementReceipt } from './arc-agreement-receipt.js'

type Dependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  readAgreement(id: string, accessToken: string): Promise<ArcAgreement | null>
  resolvePolicy(projectId: string): Promise<DeveloperCheckoutPolicy | null>
  readLink(key: string): Promise<CircleLinkRecord | null>
  writeLink(key: string, record: CircleLinkRecord): Promise<void>
  verifyWallet(input: {
    userToken: string
    chain: 'arc'
    wallet: { id: string; address: string; blockchain: string }
  }): Promise<void>
  prepareAttempt: typeof prepareArcAgreementActivationAttempt
  readAttempt: typeof readArcAgreementActivationAttempt
  readAttemptRecord: typeof readArcAgreementActivationAttemptRecord
  listAttempts?: typeof listArcAgreementActivationAttemptRecords
  rotatePayerAccess?: typeof rotateArcAgreementPayerAccess
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
  writeLink: writeCircleLink,
  verifyWallet: verifyCircleLinkWallet,
  prepareAttempt: prepareArcAgreementActivationAttempt,
  readAttempt: readArcAgreementActivationAttempt,
  readAttemptRecord: readArcAgreementActivationAttemptRecord,
  listAttempts: listArcAgreementActivationAttemptRecords,
  rotatePayerAccess: rotateArcAgreementPayerAccess,
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

function verifiedEmail(identity: VerifiedLinkUser) {
  const email = clean(identity.email, 254).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function publicAgreement(agreement: ArcAgreement) {
  const {
    requestHash: _requestHash,
    payerAccessHash: _payerAccessHash,
    payerEmail,
    ...record
  } = agreement
  const [local = '', domain = ''] = String(payerEmail ?? '').split('@')
  return {
    ...record,
    ...(payerEmail ? { payerEmailMasked: `${local.slice(0, 2)}${local.length > 2 ? '***' : '*'}@${domain}` } : {}),
  }
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

function publicDelivery(action: ArcAgreementOperatorAction | null, reviewerId = '') {
  if (!action || action.action !== 'release') return null
  return {
    id: action.id,
    step: action.step ?? 0,
    status: action.status,
    canReview: Boolean(reviewerId),
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
  if (attempt.lifecycle?.status === 'completed') {
    return releases
      .filter(item => item.status === 'completed')
      .sort((left, right) => (right.completedAt || right.updatedAt).localeCompare(left.completedAt || left.updatedAt))[0] ?? null
  }
  if (attempt.lifecycle && attempt.lifecycle.status !== 'active') return null
  if (!Number.isInteger(nextStep)) {
    return releases.find(item => item.status !== 'completed') ?? null
  }
  const releaseSteps = agreement.template === 'milestone'
    ? agreement.milestones?.length ?? 0
    : agreement.template === 'progressive_release'
      ? agreement.checkpoints?.length ?? 0
      : 1
  if ((nextStep ?? 0) >= releaseSteps) return null
  return releases.find(item => item.step === nextStep) ?? null
}

function terminalAgreementReceipt(
  agreement: ArcAgreement,
  attempt: ArcAgreementActivationAttempt | null,
  releases: ArcAgreementOperatorAction[],
  payerLifecycle: ArcAgreementPayerLifecycleAction | null,
) {
  const observation = attempt?.lifecycle
  if (!attempt?.escrow || !observation || !['completed', 'cancelled', 'refunded'].includes(observation.status)) return null
  const completedRelease = releases
    .filter(item => item.action === 'release' && item.status === 'completed' && item.transactionHash)
    .sort((left, right) => (right.step ?? 0) - (left.step ?? 0))[0]
  const transactionHash = observation.status === 'completed'
    ? completedRelease?.transactionHash
    : payerLifecycle?.status === 'confirmed'
      ? payerLifecycle.transactionHash
      : undefined
  if (!transactionHash) return null
  const returned = observation.status === 'completed'
    ? '0'
    : (BigInt(attempt.prepared.totalAmount) - BigInt(observation.releasedAmountUsdcUnits)).toString()
  return createArcAgreementReceipt({
    agreementId: agreement.id,
    title: agreement.title,
    description: agreement.description,
    template: agreement.template,
    status: observation.status as 'completed' | 'cancelled' | 'refunded',
    payer: attempt.prepared.payer,
    recipient: attempt.prepared.recipient,
    escrow: attempt.escrow,
    transactionHash,
    eventId: observation.eventId,
    createdAt: observation.observedAt,
    amountUsdcUnits: attempt.prepared.totalAmount,
    releasedUsdcUnits: observation.releasedAmountUsdcUnits,
    returnedUsdcUnits: returned,
  })
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
  'Agreement recipient must match the project Arc Testnet recipient.',
  'Operator action requires an independent reviewer.',
  'The USDC has already been returned.',
  'This agreement has already been cancelled and returned.',
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
        : message === 'Agreement recipient must match the project Arc Testnet recipient.'
          ? "Agreement recipient does not match this project's configured Arc Testnet receiving address. Create a new agreement with the configured recipient."
        : message === 'Operator action requires an independent reviewer.'
          ? 'Use the payer account that funded this agreement to review the delivery.'
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

function publicCheckoutBrand(policy: DeveloperCheckoutPolicy | null) {
  const configuredName = policy?.merchantName?.trim() || 'Hash PayLink'
  const hashPayStream = /^hash\s*pay\s*stream\b/i.test(configuredName)
  return {
    merchantName: hashPayStream ? 'HashPayStream' : configuredName,
    brandImageUrl: policy?.brandImageUrl?.trim()
      || (hashPayStream ? 'https://hashpaystream.app/brand/hashpaystream-mark.png' : null),
  }
}

export function createArcAgreementPayerHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = { ...defaults, ...overrides }
  return async function arcAgreementPayerHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    try {
      const agreementId = clean(req.body?.agreementId, 80)
      const action = clean(req.body?.action, 40)
      const capability = accessToken(req)
      if (!agreementId || !action) {
        throw fail('Agreement id and action are required.', 400)
      }
      if (action === 'brand') {
        let partnerId = ''
        if (capability) {
          const agreement = await dependencies.readAgreement(agreementId, capability)
          if (agreement?.checkoutMode === 'human') partnerId = agreement.partnerId
        } else {
          const attempts = await (dependencies.listAttempts ?? listArcAgreementActivationAttemptRecords)({ limit: 250 })
          const attempt = attempts.find(item => item.agreementId === agreementId && item.checkoutMode === 'human')
          partnerId = attempt?.partnerId ?? ''
        }
        if (!partnerId) throw fail('Agreement checkout branding is unavailable.', 404)
        const policy = await dependencies.resolvePolicy(partnerId)
        const currentPolicy = policy?.partnerId === partnerId && policy.checkoutMode === 'human' ? policy : null
        return res.json({ ok: true, brand: publicCheckoutBrand(currentPolicy) })
      }
      const identity = await dependencies.verifyUser(req)
      const identityValue = payerIdentity(identity.userId)
      if (action === 'recover-access') {
        const attempts = await (dependencies.listAttempts ?? listArcAgreementActivationAttemptRecords)({ limit: 250 })
        const attempt = attempts.find(item => item.agreementId === agreementId)
        if (!attempt || attempt.payerIdentityHash !== arcAgreementPayerIdentityHash(identityValue)) {
          throw fail('This agreement is not available for this payer identity.', 404)
        }
        if (attempt.checkoutMode !== 'human') {
          throw fail('Agentic agreements do not support human payer recovery.', 409)
        }
        const recovered = await (dependencies.rotatePayerAccess ?? rotateArcAgreementPayerAccess)(attempt.partnerId, agreementId)
        return res.json({ ok: true, payerAccessToken: recovered.payerAccessToken, payerReviewPath: recovered.payerReviewPath })
      }
      if (!capability) {
        throw fail('Agreement payer access is required.', 400)
      }
      const agreement = await dependencies.readAgreement(agreementId, capability)
      if (!agreement) throw fail('Agreement payer access is invalid or expired.', 404)
      if (agreement.checkoutMode !== 'human') {
        throw fail('Agentic agreements require the dedicated agent activation flow.', 409)
      }
      if (agreement.payerEmail && verifiedEmail(identity) !== agreement.payerEmail) {
        throw fail('This agreement is not available for this payer email.', 403)
      }
      const linkKey = circleLinkKey(identity.userId, 'arc', 'payment')
      let linkRecord = await dependencies.readLink(linkKey)
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
      const creatorFundingBlocked = currentPolicy?.ownerId === identity.userId && knownAttempt?.status !== 'active'
      if (creatorFundingBlocked && action !== 'review') {
        throw fail('Use a different payer account. The agreement creator cannot also fund this agreement.', 409)
      }

      if (action === 'link-wallet') {
        const rawWallet = req.body?.wallet && typeof req.body.wallet === 'object'
          ? req.body.wallet as Record<string, unknown>
          : {}
        const wallet = {
          id: clean(rawWallet.id, 180),
          address: clean(rawWallet.address, 42),
          blockchain: clean(rawWallet.blockchain, 40).toUpperCase(),
        }
        const circleUserToken = clean(req.body?.circleUserToken, 8_000)
        if (!circleUserToken) throw fail('A fresh Circle wallet session is required.', 401)
        if (!wallet.id || !isAddress(wallet.address) || !['ARC', 'ARC-TESTNET', 'ARC_TESTNET'].includes(wallet.blockchain)) {
          throw fail('A valid Circle Arc wallet is required.', 400)
        }
        await dependencies.verifyWallet({ userToken: circleUserToken, chain: 'arc', wallet })
        linkRecord = {
          privyUserId: identity.userId,
          ...(verifiedEmail(identity) ? { email: verifiedEmail(identity) } : {}),
          chain: 'arc',
          purpose: 'payment',
          circleWalletId: wallet.id,
          circleWalletAddress: getAddress(wallet.address),
          circleBlockchain: 'ARC-TESTNET',
          updatedAt: Date.now(),
        }
        await dependencies.writeLink(linkKey, linkRecord)
        return res.json({
          ok: true,
          payer: { walletLinked: true, walletAddress: linkRecord.circleWalletAddress, network: 'arc' },
        })
      }

      if (action === 'review') {
        const linkedWallet = linkedArcWallet(linkRecord, identity)
        const operatorActions = knownAttempt
          ? await dependencies.listOperatorActions({
              partnerId: agreement.partnerId,
              agreementId: agreement.id,
              limit: 20,
            })
          : []
        const deliveryAction = knownAttempt ? currentReleaseAction(operatorActions, knownAttempt, agreement) : null
        let terminalLifecycleAction: ArcAgreementPayerLifecycleAction | null = null
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
            terminalLifecycleAction = lifecycleAction
          } catch {
            lifecycle = { available: false }
          }
        }
        return res.json({
          ok: true,
          agreement: publicAgreement(agreement),
          brand: publicCheckoutBrand(currentPolicy),
          payer: {
            walletLinked: Boolean(linkedWallet),
            walletAddress: linkedWallet?.address ?? null,
            network: 'arc',
            creatorFundingBlocked,
          },
          attempt: knownAttempt ? publicAttempt(knownAttempt) : null,
          recovery: publicRecovery(knownAttempt),
          lifecycle,
          delivery: publicDelivery(deliveryAction, identity.userId),
          receipt: terminalAgreementReceipt(agreement, knownAttempt, operatorActions, terminalLifecycleAction),
        })
      }

      if (action === 'delivery-decision') {
        if (knownAttempt?.status !== 'active') {
          throw fail('This agreement is not active.', 409)
        }
        const linkedWallet = requireLinkedArcWallet(linkRecord, identity)
        const deliveryId = clean(req.body?.deliveryId, 40)
        if (!/^opa_[a-f0-9]{24}$/.test(deliveryId)) {
          throw fail('A valid delivery review id is required.', 400)
        }
        const releaseActions = await dependencies.listOperatorActions({
          partnerId: agreement.partnerId,
          agreementId: agreement.id,
          limit: 20,
        })
        const deliveryAction = releaseActions.find(item => item.action === 'release' && item.id === deliveryId)
        if (!deliveryAction) throw fail('No delivery is ready for review.', 404)
        if (currentReleaseAction(releaseActions, knownAttempt, agreement)?.id !== deliveryAction.id) {
          throw fail('This delivery is no longer the current milestone.', 409)
        }
        if (deliveryAction.reviewPolicy !== 'payer') {
          throw fail('This release uses the restricted operations review path.', 409)
        }
        const lifecycleReview = await dependencies.reviewLifecycle({
          client: dependencies.client(),
          partnerId: agreement.partnerId,
          agreementId: agreement.id,
          payerIdentity: identityValue,
          walletId: linkedWallet.id,
          walletAddress: linkedWallet.address,
        })
        if (lifecycleReview.eligibility.refund.eligible) {
          throw fail('This agreement has ended. Return the remaining USDC.', 409)
        }
        const decision = clean(req.body?.decision, 20)
        if (decision !== 'accept' && decision !== 'dispute') {
          throw fail('Choose release payment or report an issue.', 400)
        }
        if (deliveryAction.status !== 'awaiting_review') {
          const accepted = ['queued', 'provider_pending', 'chain_pending', 'completed'].includes(deliveryAction.status)
          const disputed = deliveryAction.status === 'disputed'
          if ((decision === 'accept' && accepted) || (decision === 'dispute' && disputed)) {
            return res.json({ ok: true, replayed: true, delivery: publicDelivery(deliveryAction, identity.userId) })
          }
          throw fail('This delivery decision has already been recorded.', 409)
        }
        const decided = decision === 'accept'
          ? await dependencies.approveOperatorAction({
              actionId: deliveryAction.id,
              requestHash: deliveryAction.requestHash,
              reviewedBy: identity.userId,
              reviewNote: 'Payer accepted the submitted delivery.',
              authoritativeNextStep: knownAttempt.lifecycle?.nextStep,
              requesterReviewAuthorized: true,
            })
          : await dependencies.disputeOperatorAction({
              actionId: deliveryAction.id,
              requestHash: deliveryAction.requestHash,
              reviewedBy: identity.userId,
              reviewNote: clean(req.body?.issue, 300),
              requesterReviewAuthorized: true,
            })
        return res.json({ ok: true, replayed: false, delivery: publicDelivery(decided, identity.userId) })
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
          payerSource: 'circle_linked_wallet',
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
          lifecycleAction: publicLifecycleAction(journal),
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
        let transactionHash = providerTransactionHash(transaction)
        let chainClient: ArcAgreementActivationClient | null = null
        if (!transactionHash && stage === 'activation') {
          const approvalBlock = [...knownAttempt.transactions].reverse().find(item => item.stage === 'approval' && item.status === 'confirmed')?.blockNumber
          if (approvalBlock) {
            chainClient = dependencies.client()
            transactionHash = await chainClient.findAgreementCreationTransaction?.({ factory: knownAttempt.prepared.factory, agreementId: knownAttempt.prepared.agreementId, fromBlock: BigInt(approvalBlock) }) ?? ''
          }
        }
        if (!transactionHash && PROVIDER_FAILURES.has(transactionState)) {
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
          client: chainClient ?? dependencies.client(),
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
