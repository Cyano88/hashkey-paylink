import { hasRenderDurableStore, queryDurablePostgres } from '../render-durable-store.js'
import { readPocketReconciliationBacklog } from './reconciliation-health.js'

export async function readPocketOperationsHealth() {
  if (!hasRenderDurableStore()) return { configured: false, healthy: false, database: false, unresolved: 0, stale: 0 }
  await queryDurablePostgres('select 1 as ok')
  const backlog = await readPocketReconciliationBacklog()
  return { configured: true, healthy: backlog.stale === 0, database: true, unresolved: backlog.total, stale: backlog.stale, oldestAgeMs: backlog.oldestAgeMs, byRail: backlog.byRail }
}
