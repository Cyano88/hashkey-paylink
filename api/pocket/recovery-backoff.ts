/** Scheduled recovery only. An unchanged failing record stays unresolved and
 * visible; user-triggered recovery and newly updated records are not delayed. */
export function createRecoveryBackoff(now = Date.now) {
  type Entry = {failures: number; retryAt: number; error?: unknown; running?: Promise<unknown>}
  const entries = new Map<string, Entry>()
  return async <T>(revision: string, operation: () => Promise<T>): Promise<T> => {
    let entry = entries.get(revision)
    if (!entry) {
      if (entries.size >= 1000) {
        const victim = [...entries].find(([, e]) => !e.running)
        if (!victim) throw Error('Recovery capacity reached. Retry shortly.')
        entries.delete(victim[0])
      }
      entry = {failures: 0, retryAt: 0}; entries.set(revision, entry)
    }
    if (entry.running) return entry.running as Promise<T>
    if (now() < entry.retryAt) throw entry.error
    const current = entry
    const task = Promise.resolve().then(operation).then(result => {
      entries.delete(revision)
      return result
    }, error => {
      current.failures++; current.error = error
      current.retryAt = now() + Math.min(900_000, 60_000 * 2 ** Math.min(current.failures - 1, 4))
      throw error
    }).finally(() => { current.running = undefined })
    current.running = task
    return task
  }
}
