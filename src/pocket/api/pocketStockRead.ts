// Memory-only, bounded, credential-scoped reads. Never retry a payment mutation.
type Entry = { value?: unknown; freshUntil: number; retryAt: number; failures: number; error?: Error; pending?: Promise<unknown> }
const readers = new Map<string, Entry>()
export async function stockApiResponse(response: Response): Promise<any> {
 const data = await response.json().catch(() => null)
 if (!response.ok || !data || data.ok !== true) {
  const temporary = response.status === 429 || response.status >= 500 || !data
  const message = temporary ? 'This service is temporarily unavailable. Please try again shortly.' : typeof data.error === 'string' ? data.error : 'The request could not be completed.'
  const header = response.headers.get('Retry-After')
  const seconds = header ? Number(header) : NaN
  const retryMs = header ? (Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now()) : 0
  throw Object.assign(Error(message), { status: response.status, retryMs: Math.max(0, Number.isFinite(retryMs) ? retryMs : 0) })
 }
 return data
}
export function invalidateStockReads(token: string) {
 for (const key of readers.keys()) if (key.startsWith(token + ':')) readers.delete(key)
}
export async function stockRead<T>(token: string, resource: string, read: () => Promise<T>): Promise<T> {
 const key = token + ':' + resource
 let entry = readers.get(key)
 if (!entry) {
  if (readers.size >= 32) readers.delete(readers.keys().next().value!)
  entry = { freshUntil: 0, retryAt: 0, failures: 0 }; readers.set(key, entry)
 }
 if (entry.pending) return entry.pending as Promise<T>
 if (Date.now() < entry.retryAt) throw entry.error
 if (Date.now() < entry.freshUntil) return entry.value as T
 const current = entry
 const pending = read().then(value => {
  current.value = value; current.freshUntil = Date.now() + 10000; current.retryAt = 0; current.failures = 0
  return value
 }, error => {
  current.error = error; current.failures++
  current.retryAt = Date.now() + Math.max(error?.retryMs || 0, Math.min(120000, 15000 * 2 ** Math.min(current.failures - 1, 3)))
  throw error
 }).finally(() => { current.pending = undefined })
 current.pending = pending
 return pending
}
