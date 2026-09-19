/** Short-lived, process-local containment for legacy public archive lookups. */
export function createArchiveLookupCache<T>(
  read: (eventId: string, payer: string) => Promise<T | null>,
  now = Date.now,
) {
  const cache = new Map<string, { value: T | null; until: number }>()
  const pending = new Map<string, Promise<T | null>>()
  return async (eventId: string, payer: string): Promise<T | null> => {
    eventId = eventId.trim()
    payer = payer.trim()
    if (!eventId || !payer || eventId.length > 128 || payer.length > 128) {
      throw new Error('Invalid archive lookup input')
    }
    const key = JSON.stringify([eventId, payer.toLowerCase()])
    const hit = cache.get(key)
    if (hit && hit.until > now()) return structuredClone(hit.value)
    cache.delete(key)
    const running = pending.get(key)
    if (running) return structuredClone(await running)
    if (pending.size >= 4) throw new Error('Archive lookup busy')
    const task = Promise.resolve().then(() => read(eventId, payer)).then(value => {
      if (cache.size >= 256) cache.delete(cache.keys().next().value as string)
      cache.set(key, { value: structuredClone(value), until: now() + (value ? 30_000 : 5_000) })
      return value
    }).finally(() => pending.delete(key))
    pending.set(key, task)
    return structuredClone(await task)
  }
}
