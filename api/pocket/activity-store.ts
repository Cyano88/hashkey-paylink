import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { hasRenderDurableStore, readDurableJson, mutateDurableJson } from '../render-durable-store.js'
import type { ActivityFeed } from './activity-feed.js'

/** Local development has the same restart durability as Postgres, without a shared multi-process file. */
export function createFileActivityStore(directory: string) {
  const pending = new Map<string, Promise<unknown>>()
  const pathFor = (key: string) => {
    if (!/^pocket:activity-feed:v1:[a-f0-9]{64}$/.test(key)) throw new Error('Invalid activity storage key.')
    return join(directory, key.slice(-64) + '.json')
  }
  const read = async (key: string): Promise<ActivityFeed | undefined> => {
    try { return JSON.parse(await readFile(pathFor(key), 'utf8')) as ActivityFeed }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
  }
  return {
    read,
    mutate(key: string, update: (current: ActivityFeed | undefined) => ActivityFeed): Promise<ActivityFeed> {
      const work = (pending.get(key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
        const next = update(await read(key))
        await mkdir(directory, { recursive: true })
        const path = pathFor(key), temp = path + '.' + randomUUID() + '.tmp'
        await writeFile(temp, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 })
        await rename(temp, path)
        return next
      }).finally(() => { if (pending.get(key) === work) pending.delete(key) })
      pending.set(key, work)
      return work
    },
  }
}
const local = createFileActivityStore(join(process.env.DATA_PATH || './data', 'pocket-activity'))
const production = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL || process.env.NODE_ENV === 'production')
export const pocketActivityStore = {
  async read(key: string): Promise<ActivityFeed | undefined> {
    if (hasRenderDurableStore()) return readDurableJson<ActivityFeed>(key)
    if (production) throw new Error('Durable activity storage is not configured.')
    return local.read(key)
  },
  async mutate(key: string, update: (current: ActivityFeed | undefined) => ActivityFeed): Promise<ActivityFeed> {
    if (hasRenderDurableStore()) return mutateDurableJson<ActivityFeed>(key, update)
    if (production) throw new Error('Durable activity storage is not configured.')
    return local.mutate(key, update)
  },
}
