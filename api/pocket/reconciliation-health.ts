import { paymentExecutionRepository } from './payment-execution-intents.js'

export async function readPocketReconciliationBacklog(now = Date.now()) {
  const intents = await paymentExecutionRepository.listUnresolved(1000)
  const staleAfter = Number(process.env.POCKET_MAX_UNRESOLVED_AGE_MS ?? 15 * 60_000)
  const byRail = Object.fromEntries([...new Set(intents.map(intent => intent.kind))].map(kind => [kind, intents.filter(intent => intent.kind === kind).length]))
  const stale = intents.filter(intent => now - intent.updatedAt > staleAfter)
  return {
    total: intents.length,
    stale: stale.length,
    oldestAgeMs: intents[0] ? Math.max(0, now - intents[0].updatedAt) : 0,
    byRail,
    staleExecutionIds: stale.slice(0, 25).map(intent => intent.id),
  }
}
