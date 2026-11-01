export type HistoryProofRetries = Record<string, {failures: number; nextAt: number}>

/** Pending evidence is never discarded. Only due proofs consume an RPC slot. */
export function dueHistoryProofs(pending: string[], retries: HistoryProofRetries = {}, now = Date.now(), limit = 4) {
  return pending.filter(hash => (retries[hash]?.nextAt ?? 0) <= now).slice(0, limit)
}

export function deferHistoryProof(retries: HistoryProofRetries, hash: string, now = Date.now()) {
  const failures = Math.min(32, (retries[hash]?.failures ?? 0) + 1)
  return {...retries, [hash]: {failures, nextAt: now + Math.min(15 * 60_000, 30_000 * 2 ** Math.min(failures - 1, 5))}}
}
