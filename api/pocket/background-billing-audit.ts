/** Only scheduled monitoring is throttled. Payment preflight must call the
 * original billing guard directly, including fresh receipts and prices. */
export function createBackgroundBillingAudit(audit: () => Promise<void>, now = Date.now) {
  let nextAt = 0, failures = 0, failed = false, lastError: unknown
  let running: Promise<void> | undefined
  return async () => {
    if (running) return running
    if (now() < nextAt) {
      if (failed) throw lastError
      return
    }
    running = Promise.resolve().then(audit).then(() => {
      failures = 0; failed = false; lastError = undefined
      nextAt = now() + 15 * 60_000
    }, error => {
      failed = true; lastError = error; failures++
      nextAt = now() + Math.min(15 * 60_000, 60_000 * 2 ** Math.min(failures - 1, 4))
      throw error
    }).finally(() => { running = undefined })
    return running
  }
}
