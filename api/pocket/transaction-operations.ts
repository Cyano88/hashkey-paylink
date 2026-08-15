import type { Request, Response } from 'express'
import { verifyDeveloperOperationsAdmin } from '../developer-projects.js'
import { drainPocketReconciliation } from './reconciliation-worker.js'
import { paymentExecutionRepository, type PaymentExecutionIntent } from './payment-execution-intents.js'

type Dependencies = {
  verifyAdmin: typeof verifyDeveloperOperationsAdmin
  listUnresolved: (limit: number) => Promise<PaymentExecutionIntent[]>
  reconcile: typeof drainPocketReconciliation
  now: () => number
}

const defaults: Dependencies = {
  verifyAdmin: verifyDeveloperOperationsAdmin,
  listUnresolved: limit => paymentExecutionRepository.listUnresolved(limit),
  reconcile: drainPocketReconciliation,
  now: Date.now,
}

function publicExecution(intent: PaymentExecutionIntent, now: number) {
  return {
    id: intent.id,
    owner: intent.ownerId.length > 16 ? `${intent.ownerId.slice(0, 8)}...${intent.ownerId.slice(-5)}` : intent.ownerId,
    kind: intent.kind,
    state: intent.state,
    asset: intent.asset,
    amount: intent.amount,
    sourceNetwork: intent.sourceNetwork,
    settlementNetwork: intent.settlementNetwork,
    destinationType: intent.destinationType,
    resourceId: intent.resourceId || '',
    providerReference: intent.providerReference || '',
    transactionHash: intent.transactionHash || '',
    failureCode: intent.failureCode || '',
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
    pendingForMs: Math.max(0, now - intent.createdAt),
    ageMs: Math.max(0, now - intent.updatedAt),
  }
}

export function createPocketTransactionOperationsHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function pocketTransactionOperationsHandler(req: Request, res: Response) {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    try {
      await dependencies.verifyAdmin(req)
      let reconciliation: Awaited<ReturnType<typeof drainPocketReconciliation>> | undefined
      if (req.method === 'POST') {
        if (String(req.body?.action || '').trim() !== 'reconcile') return res.status(400).json({ ok: false, error: 'Unsupported transaction operation.' })
        reconciliation = await dependencies.reconcile()
      }
      const now = dependencies.now()
      const executions = (await dependencies.listUnresolved(500)).map(intent => publicExecution(intent, now))
      const configuredStaleAge = Number(process.env.POCKET_MAX_UNRESOLVED_AGE_MS ?? 15 * 60_000)
      const staleAfterMs = Number.isFinite(configuredStaleAge) ? Math.max(60_000, configuredStaleAge) : 15 * 60_000
      return res.status(200).json({
        ok: true,
        executions,
        summary: {
          unresolved: executions.length,
          processing: executions.filter(item => item.state === 'submitted' || item.state === 'processing').length,
          needsReview: executions.filter(item => item.state === 'needs_review').length,
          stale: executions.filter(item => item.ageMs >= staleAfterMs).length,
        },
        staleAfterMs,
        ...(reconciliation ? { reconciliation } : {}),
      })
    } catch (error) {
      const status = Number((error as Error & { status?: number })?.status) || 500
      const message = status >= 500 ? 'Transaction operations are temporarily unavailable.' : (error instanceof Error ? error.message : 'Transaction operations request failed.')
      return res.status(status).json({ ok: false, error: message })
    }
  }
}

export default createPocketTransactionOperationsHandler()
