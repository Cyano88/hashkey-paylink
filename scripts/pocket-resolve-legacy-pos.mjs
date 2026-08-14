import { reconcilePaycrestOrderPayment } from '../api/paycrest-reconcile.ts'
import { paymentExecutionRepository } from '../api/pocket/payment-execution-intents.ts'

const ids = process.argv.slice(2).map(value => String(value).trim()).filter(Boolean)
if (!ids.length) throw new Error('Pass one or more exact payment execution IDs.')
const unresolved = await paymentExecutionRepository.listUnresolved(1000)
const threshold = Math.max(60_000, Number(process.env.POCKET_MAX_UNRESOLVED_AGE_MS ?? 15 * 60_000))
const results = []

for (const id of ids) {
  const intent = unresolved.find(item => item.id === id)
  if (!intent) throw new Error(`Execution ${id} is not unresolved.`)
  if (intent.kind !== 'pos_settlement') throw new Error(`Execution ${id} is not a POS settlement.`)
  if (Date.now() - intent.updatedAt <= threshold) throw new Error(`Execution ${id} is not stale.`)
  if (!intent.resourceId) throw new Error(`Execution ${id} has no POS order reference.`)
  if (intent.transactionHash) throw new Error(`Execution ${id} has a transaction hash and requires provider-backed review.`)
  const provider = await reconcilePaycrestOrderPayment(intent.resourceId, { allowTerminalScan: true })
  if (provider.order) throw new Error(`Execution ${id} has a recoverable Paycrest order and cannot be closed as legacy.`)
  const updated = await paymentExecutionRepository.update({
    ownerId: intent.ownerId,
    intentId: intent.id,
    expectedState: intent.state,
    state: 'failed',
    failureCode: 'LEGACY_PROVIDER_RECORD_UNAVAILABLE',
    metadata: { operatorResolution: 'legacy_orphan_closed' },
  })
  results.push({ id: updated.id, state: updated.state, failureCode: updated.failureCode })
}

console.log(`POCKET_LEGACY_POS_RESOLUTION ${JSON.stringify({ ok: true, results })}`)
