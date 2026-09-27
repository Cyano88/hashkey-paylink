import { readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { mutateDurableJson, readDurableJson } from './render-durable-store.js'

// Used only when Postgres is configured. The original file is a one-time seed,
// never a fallback after a database failure. Empty stores remain authoritative.
export function migratedJsonStore<T extends object>(key: string, path: string, empty: () => T) {
  const bases = new WeakMap<T, T>()
  async function read(): Promise<T> {
    let value = await readDurableJson<T>(key)
    if (value === undefined) {
      value = await mutateDurableJson<T>(key, async current => {
        if (current !== undefined) return current
        try {
          const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid migration source.')
          return parsed as T
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !process.env.RENDER && !process.env.RENDER_SERVICE_ID) return empty()
          throw new Error('Durable store migration requires a valid source file.')
        }
      })
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid durable store.')
    const result = structuredClone(value)
    bases.set(result, structuredClone(value))
    return result
  }
  async function write(value: T): Promise<void> {
    const base = bases.get(value)
    if (!base) throw new Error('Read the durable store before modifying it.')
    await mutateDurableJson<T>(key, current => {
      if (!isDeepStrictEqual(current, base)) throw new Error('The record changed. Refresh and try again.')
      return value
    })
    bases.set(value, structuredClone(value))
  }
  return { read, write }
}
