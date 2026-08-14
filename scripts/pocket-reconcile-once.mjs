import { runPocketReconciliation } from '../api/pocket/reconciliation-worker.ts'

const result = await runPocketReconciliation()
console.log(`POCKET_RECONCILIATION_RESULT ${JSON.stringify(result)}`)
if (!result.ok) process.exitCode = 1
