import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

export class PaylinkRequestStorageError extends Error {
  status = 503
  constructor() { super('Payment request storage is temporarily unavailable.') }
}

export function validatePaylinkRequestStore<T>(value: unknown): { requests: Record<string, T> } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PaylinkRequestStorageError()
  const requests = (value as { requests?: unknown }).requests
  if (!requests || typeof requests !== 'object' || Array.isArray(requests)) throw new PaylinkRequestStorageError()
  for (const [id, record] of Object.entries(requests)) {
    if (!record || typeof record !== 'object' || Array.isArray(record) || (record as { id?: unknown }).id !== id) throw new PaylinkRequestStorageError()
  }
  return { requests: requests as Record<string, T> }
}

export function createPaylinkRequestFileStore<T>(storePath: string) {
  const path = resolve(storePath)
  let queue = Promise.resolve()
  async function read() {
    let raw: string
    try { raw = await readFile(path, 'utf8') }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { requests: {} as Record<string, T> }
      throw new PaylinkRequestStorageError()
    }
    try { return validatePaylinkRequestStore<T>(JSON.parse(raw)) }
    catch { throw new PaylinkRequestStorageError() }
  }
  async function write(store: { requests: Record<string, T> }) {
    const temporary = path + '.' + randomUUID() + '.tmp'
    let created = false
    try {
      validatePaylinkRequestStore<T>(store)
      await mkdir(dirname(path), { recursive: true })
      const handle = await open(temporary, 'wx', 0o600)
      created = true
      try { await handle.writeFile(JSON.stringify(store) + '\n', 'utf8'); await handle.sync() }
      finally { await handle.close() }
      await rename(temporary, path)
    } catch { throw new PaylinkRequestStorageError() }
    finally { if (created) await unlink(temporary).catch(() => undefined) }
  }
  async function mutate<R>(mutation: (store: { requests: Record<string, T> }) => R | Promise<R>): Promise<R> {
    const run = queue.then(async () => {
      const store = await read()
      const result = await mutation(store)
      await write(store)
      return result
    })
    queue = run.then(() => undefined, () => undefined)
    return run
  }
  return { read, mutate }
}
