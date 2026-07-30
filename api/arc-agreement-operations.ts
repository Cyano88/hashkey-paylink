import { createHash } from 'node:crypto'
import type { Request, Response } from 'express'
import {
  listArcAgreementActivationAttemptRecords,
  readArcAgreementActivationBinding,
  type ArcAgreementActivationClient,
} from './arc-agreement-activation-attempts.js'
import { createArcAgreementActivationClient } from './arc-agreement-activation-client.js'
import {
  approveArcAgreementOperatorAction,
  createArcAgreementOperatorActionRequest,
  listArcAgreementOperatorActions,
  type ArcAgreementOperatorAction,
} from './arc-agreement-operator-actions.js'
import { createArcAgreementOperatorClient } from './arc-agreement-operator-client.js'
import {
  prepareArcAgreementCancellationCall,
  prepareArcAgreementReleaseCall,
} from './arc-agreement-operator.js'
import {
  listArcAgreementPayerLifecycleActions,
  type ArcAgreementPayerLifecycleAction,
} from './arc-agreement-payer-lifecycle.js'
import { readConfirmedArcAgreementSnapshot } from './arc-agreement-confirmed-snapshot.js'
import { listArcAgreementRecords } from './arc-agreements.js'
import { verifyDeveloperOperationsAdmin } from './developer-projects.js'

type AdminIdentity = { userId: string; email: string }

type Dependencies = {
  verifyAdmin(req: Request): Promise<AdminIdentity>
  listAgreements: typeof listArcAgreementRecords
  listAttempts: typeof listArcAgreementActivationAttemptRecords
  listOperatorActions: typeof listArcAgreementOperatorActions
  listPayerActions: typeof listArcAgreementPayerLifecycleActions
  binding: typeof readArcAgreementActivationBinding
  confirmed: typeof readConfirmedArcAgreementSnapshot
  prepareRelease: typeof prepareArcAgreementReleaseCall
  prepareCancellation: typeof prepareArcAgreementCancellationCall
  createAction: typeof createArcAgreementOperatorActionRequest
  approveAction: typeof approveArcAgreementOperatorAction
  operatorClient: typeof createArcAgreementOperatorClient
  chainClient(): ArcAgreementActivationClient
  createIdempotencyKey(seed: string): string
  env(): NodeJS.ProcessEnv
}

const defaults: Dependencies = {
  verifyAdmin: verifyDeveloperOperationsAdmin,
  listAgreements: listArcAgreementRecords,
  listAttempts: listArcAgreementActivationAttemptRecords,
  listOperatorActions: listArcAgreementOperatorActions,
  listPayerActions: listArcAgreementPayerLifecycleActions,
  binding: readArcAgreementActivationBinding,
  confirmed: readConfirmedArcAgreementSnapshot,
  prepareRelease: prepareArcAgreementReleaseCall,
  prepareCancellation: prepareArcAgreementCancellationCall,
  createAction: createArcAgreementOperatorActionRequest,
  approveAction: approveArcAgreementOperatorAction,
  operatorClient: createArcAgreementOperatorClient,
  chainClient: createArcAgreementActivationClient,
  createIdempotencyKey: seed => {
    const bytes = Buffer.from(createHash('sha256').update(seed).digest())
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = bytes.subarray(0, 16).toString('hex')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  },
  env: () => process.env,
}

function clean(value: unknown, max: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function fail(message: string, status: number) {
  return Object.assign(new Error(message), { status })
}

function publicOperatorAction(action: ArcAgreementOperatorAction) {
  return {
    id: action.id,
    partnerId: action.partnerId,
    agreementId: action.agreementId,
    action: action.action,
    step: action.step,
    evidenceHash: action.evidenceHash,
    evidenceReference: action.evidenceReference,
    requestHash: action.requestHash,
    requestedBy: action.requestedBy,
    requestedAt: action.requestedAt,
    status: action.status,
    reviewedBy: action.reviewedBy,
    reviewedAt: action.reviewedAt,
    reviewNote: action.reviewNote,
    providerState: action.providerState,
    transactionHash: action.transactionHash,
    observedBlockNumber: action.observedBlockNumber,
    completedAt: action.completedAt,
    failedAt: action.failedAt,
    lastError: action.lastError,
    attempts: action.attempts,
    updatedAt: action.updatedAt,
  }
}

function publicPayerAction(action: ArcAgreementPayerLifecycleAction) {
  return {
    action: action.action,
    status: action.status,
    transactionHash: action.transactionHash,
    submittedAt: action.submittedAt,
    confirmedAt: action.confirmedAt,
    observedBlockNumber: action.observedBlockNumber,
    lastError: action.lastError,
    retryable: action.status === 'provider_failed'
      && !action.providerTransactionId
      && !action.transactionHash,
    updatedAt: action.updatedAt,
  }
}

function chainStatus(value: number) {
  if (value === 1) return 'active'
  if (value === 2) return 'completed'
  if (value === 3) return 'cancelled'
  if (value === 4) return 'refunded'
  return 'unknown'
}

function workerEnabled(env: NodeJS.ProcessEnv) {
  return String(env.ARC_AGREEMENT_OPERATOR_WORKER_ENABLED ?? '').trim().toLowerCase() === 'true'
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  map: (value: T) => Promise<R>,
) {
  const output = new Array<R>(values.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      output[index] = await map(values[index])
    }
  }))
  return output
}

function operationStatus(error: unknown) {
  const explicit = Number((error as Error & { status?: number })?.status)
  if (explicit) return explicit
  const message = error instanceof Error ? error.message : ''
  if (/invalid|required|must be|cannot include/i.test(message)) return 400
  if (/independent reviewer|changed after|already|current|requires|not found/i.test(message)) return 409
  return 500
}

export function createArcAgreementOperationsHandler(dependencies: Dependencies = defaults) {
  return async function arcAgreementOperationsHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    try {
      const identity = await dependencies.verifyAdmin(req)
      if (req.method === 'GET') {
        const [agreements, attempts, operatorActions, payerActions] = await Promise.all([
          dependencies.listAgreements({ limit: 100 }),
          dependencies.listAttempts({ limit: 100 }),
          dependencies.listOperatorActions({ limit: 250 }),
          dependencies.listPayerActions({ limit: 100 }),
        ])
        const agreementsById = new Map(agreements.map(agreement => [agreement.id, agreement]))
        const operatorByAgreement = new Map<string, ArcAgreementOperatorAction[]>()
        for (const action of operatorActions) {
          const current = operatorByAgreement.get(action.agreementId) ?? []
          current.push(action)
          operatorByAgreement.set(action.agreementId, current)
        }
        const payerByAgreement = new Map(payerActions.map(action => [action.agreementId, action]))
        const needsChain = attempts.some(attempt => attempt.status === 'active' && attempt.escrow)
        const client = needsChain ? dependencies.chainClient() : null
        const rows = await mapConcurrent(attempts, 4, async attempt => {
          const agreement = agreementsById.get(attempt.agreementId)
          let chain: {
            status: string
            nextStep: number
            releasedUsdcUnits: string
            remainingUsdcUnits: string
            cancelUntil: string
            expiresAt: string
            observedBlockNumber: string
          } | null = null
          let chainUnavailable = false
          if (attempt.status === 'active' && attempt.escrow) {
            try {
              const binding = await dependencies.binding(attempt.partnerId, attempt.agreementId)
              const confirmed = await dependencies.confirmed(client!, binding.escrow)
              chain = {
                status: chainStatus(confirmed.snapshot.status),
                nextStep: confirmed.snapshot.nextStep,
                releasedUsdcUnits: confirmed.snapshot.releasedAmount.toString(),
                remainingUsdcUnits: confirmed.snapshot.tokenBalance.toString(),
                cancelUntil: confirmed.snapshot.cancelUntil.toString(),
                expiresAt: confirmed.snapshot.expiresAt.toString(),
                observedBlockNumber: confirmed.observedBlockNumber.toString(),
              }
            } catch {
              chainUnavailable = true
            }
          }
          return {
            partnerId: attempt.partnerId,
            agreementId: attempt.agreementId,
            title: agreement?.title || 'Arc Agreement',
            description: agreement?.description || '',
            amount: agreement?.amount || '',
            recipient: agreement?.recipient || attempt.prepared.recipient,
            template: agreement?.template || '',
            activationStatus: attempt.status,
            escrow: attempt.escrow ?? null,
            createdAt: attempt.createdAt,
            updatedAt: attempt.updatedAt,
            chain,
            chainUnavailable,
            payerAction: payerByAgreement.has(attempt.agreementId)
              ? publicPayerAction(payerByAgreement.get(attempt.agreementId)!)
              : null,
            operatorActions: (operatorByAgreement.get(attempt.agreementId) ?? []).map(publicOperatorAction),
          }
        })
        const attention = rows.filter(row => (
          row.chainUnavailable
          || row.payerAction?.status === 'manual_review'
          || row.operatorActions.some(action => action.status === 'manual_review' || action.status === 'failed')
        )).length
        return res.json({
          ok: true,
          workerEnabled: workerEnabled(dependencies.env()),
          agreements: rows,
          summary: {
            total: rows.length,
            active: rows.filter(row => row.chain?.status === 'active').length,
            review: operatorActions.filter(action => action.status === 'awaiting_review').length,
            attention,
            terminal: rows.filter(row => ['completed', 'cancelled', 'refunded'].includes(row.chain?.status ?? '')).length,
          },
        })
      }

      if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method not allowed.' })
      }
      const action = clean(req.body?.action, 40)
      if (action === 'request-release' || action === 'request-cancel') {
        const agreementId = clean(req.body?.agreementId, 80)
        const partnerId = clean(req.body?.partnerId, 80)
        const evidenceHash = clean(req.body?.evidenceHash, 66)
        const evidenceReference = clean(req.body?.evidenceReference, 240)
        if (!/^agr_[a-z0-9]{12,64}$/i.test(agreementId)) throw fail('Agreement id is invalid.', 400)
        if (!/^dev_[a-z0-9]{8,64}$/i.test(partnerId)) throw fail('Developer project id is invalid.', 400)
        if (!/^0x[0-9a-f]{64}$/i.test(evidenceHash) || /^0x0{64}$/i.test(evidenceHash)) {
          throw fail('Evidence hash must be a non-zero bytes32 value.', 400)
        }
        if (evidenceReference.length < 6) throw fail('Evidence reference is required.', 400)
        const binding = await dependencies.binding(partnerId, agreementId)
        const client = dependencies.chainClient()
        const confirmed = await dependencies.confirmed(client, binding.escrow)
        const operatorWallet = await dependencies.operatorClient().operatorWallet(confirmed.snapshot.operator)
        const requestedBy = identity.userId
        const requestedAction = action === 'request-release' ? 'release' : 'cancel'
        const step = requestedAction === 'release' ? confirmed.snapshot.nextStep : undefined
        const idempotencyKey = dependencies.createIdempotencyKey([
          'hashpaylink.arc-agreement.operations-request',
          binding.partnerId,
          agreementId,
          requestedAction,
          step ?? '',
          evidenceHash.toLowerCase(),
          evidenceReference,
          requestedBy,
        ].join('\0'))
        const preparedCall = requestedAction === 'release'
          ? dependencies.prepareRelease({
              operatorWallet,
              idempotencyKey,
              partnerId: binding.partnerId,
              agreementId,
              prepared: binding.prepared,
              confirmed,
              step: step!,
              evidenceHash,
            })
          : dependencies.prepareCancellation({
              operatorWallet,
              idempotencyKey,
              partnerId: binding.partnerId,
              agreementId,
              prepared: binding.prepared,
              confirmed,
              reasonHash: evidenceHash,
            })
        const created = await dependencies.createAction({
          partnerId: binding.partnerId,
          agreementId,
          action: requestedAction,
          ...(requestedAction === 'release' ? { step } : {}),
          evidenceHash,
          evidenceReference,
          requestedBy,
          idempotencyKey,
          preparedCall,
        })
        return res.status(201).json({
          ok: true,
          workerEnabled: workerEnabled(dependencies.env()),
          operatorAction: publicOperatorAction(created),
        })
      }
      if (action === 'approve') {
        const actionId = clean(req.body?.actionId, 40)
        const requestHash = clean(req.body?.requestHash, 64)
        const reviewNote = clean(req.body?.reviewNote, 300)
        if (!/^opa_[a-f0-9]{24}$/.test(actionId)) throw fail('Operator action id is invalid.', 400)
        if (!/^[a-f0-9]{64}$/.test(requestHash)) throw fail('Operator request hash is invalid.', 400)
        if (reviewNote.length < 8) throw fail('A review note is required.', 400)
        const approved = await dependencies.approveAction({
          actionId,
          requestHash,
          reviewedBy: identity.userId,
          reviewNote,
        })
        return res.json({
          ok: true,
          workerEnabled: workerEnabled(dependencies.env()),
          operatorAction: publicOperatorAction(approved),
        })
      }
      throw fail('Unknown Arc Agreement operations action.', 400)
    } catch (error) {
      const status = operationStatus(error)
      if (status >= 500) {
        console.error('[arc-agreement-operations] request failed:', error instanceof Error ? error.message : String(error))
      }
      return res.status(status).json({
        ok: false,
        error: status >= 500
          ? 'Arc Agreement operations are temporarily unavailable.'
          : (error as Error).message,
      })
    }
  }
}

export default createArcAgreementOperationsHandler()
