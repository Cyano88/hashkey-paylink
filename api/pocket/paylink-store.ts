import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from '../render-durable-store.js'

export type PocketCollectionLink = {
  eventId: string
  ownerId: string
  title: string
  paymentUrl: string
  createdAt: number
  updatedAt: number
}

type Store = { links: Record<string, PocketCollectionLink> }
type Options = {
  storePath?: string
  storeKey?: string
  durable?: boolean
  isRender?: boolean
  now?: () => number
  mutateDurable?: typeof mutateDurableJson
  readDurable?: typeof readDurableJson
}

const STORE_PATH = process.env.POCKET_PAYLINK_STORE ?? './data/pocket-paylinks.json'
const STORE_KEY = (process.env.POCKET_PAYLINK_STORE_KEY ?? 'hashpaylink:pocket-paylinks:v1').trim()
const IS_RENDER = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL)
const EVENT_ID = /^[a-zA-Z0-9:_-]{8,120}$/

export class PocketPaylinkConflictError extends Error { status = 409 }

function normalizedStore(value?: Partial<Store> | null): Store {
  return { links: value?.links ?? {} }
}

function clean(value: unknown, max: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function validatePaymentUrl(value: unknown, eventId: string) {
  const raw = clean(value, 2_000)
  let parsed: URL
  try { parsed = new URL(raw) } catch { throw Object.assign(new Error('Collection payment link is invalid.'), { status: 400 }) }
  const checkoutHost = parsed.hostname.toLowerCase()
  const trustedCheckout = parsed.protocol === 'https:' && (checkoutHost === 'app.hashpaylink.com' || checkoutHost === 'pocket.hashpaylink.com')
  const localCheckout = parsed.protocol === 'http:' && (checkoutHost === 'localhost' || checkoutHost === '127.0.0.1')
  if ((!trustedCheckout && !localCheckout) || parsed.username || parsed.password || parsed.pathname !== '/pay') {
    throw Object.assign(new Error('Collection payment link is invalid.'), { status: 400 })
  }
  if (parsed.searchParams.get('v') !== '1' || parsed.searchParams.get('id') !== eventId) {
    throw Object.assign(new Error('Collection payment link does not match its event ID.'), { status: 400 })
  }
  parsed.hash = ''
  return parsed.toString()
}

export function createPocketPaylinkRepository(options: Options = {}) {
  const storePath = resolve(options.storePath ?? STORE_PATH)
  const storeKey = options.storeKey ?? STORE_KEY
  const durable = options.durable ?? hasRenderDurableStore()
  const isRender = options.isRender ?? IS_RENDER
  const now = options.now ?? Date.now
  const mutateRemote = options.mutateDurable ?? mutateDurableJson
  const readRemote = options.readDurable ?? readDurableJson
  let queue = Promise.resolve()

  async function readLocal() {
    try { return normalizedStore(JSON.parse(await readFile(storePath, 'utf8')) as Store) }
    catch { return normalizedStore() }
  }

  async function writeLocal(store: Store) {
    await mkdir(dirname(storePath), { recursive: true })
    await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
  }

  async function readStore() {
    if (durable) return normalizedStore(await readRemote<Store>(storeKey))
    if (isRender) throw new Error('Durable Pocket collection storage is not configured.')
    return readLocal()
  }

  async function mutate<T>(fn: (store: Store) => T) {
    if (durable) {
      let result: T | undefined
      await mutateRemote<Store>(storeKey, current => {
        const store = normalizedStore(current)
        result = fn(store)
        return store
      })
      if (result === undefined) throw new Error('Pocket collection mutation returned no result.')
      return result
    }
    if (isRender) throw new Error('Durable Pocket collection storage is not configured.')
    let result: T | undefined
    const run = queue.then(async () => {
      const store = await readLocal()
      result = fn(store)
      await writeLocal(store)
    })
    queue = run.catch(() => undefined)
    await run
    return result as T
  }

  return {
    async save(input: { ownerId: string; eventId: string; title: string; paymentUrl: string }) {
      const ownerId = clean(input.ownerId, 180)
      const eventId = clean(input.eventId, 120)
      const title = clean(input.title, 90) || 'Untitled collection'
      if (!ownerId || !EVENT_ID.test(eventId)) {
        throw Object.assign(new Error('Collection identity is invalid.'), { status: 400 })
      }
      const paymentUrl = validatePaymentUrl(input.paymentUrl, eventId)
      return mutate(store => {
        const existing = store.links[eventId]
        if (existing && existing.ownerId !== ownerId) {
          throw new PocketPaylinkConflictError('This collection is already connected to another Pocket account.')
        }
        const timestamp = now()
        const link: PocketCollectionLink = {
          eventId,
          ownerId,
          title,
          paymentUrl,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        }
        store.links[eventId] = link
        return { link, replayed: Boolean(existing) }
      })
    },
    async listOwned(ownerId: string) {
      const cleanOwnerId = clean(ownerId, 180)
      return Object.values((await readStore()).links)
        .filter(link => link.ownerId === cleanOwnerId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
    },
    async getOwned(ownerId: string, eventId: string) {
      const link = (await readStore()).links[clean(eventId, 120)]
      return link?.ownerId === clean(ownerId, 180) ? link : undefined
    },
  }
}

export type PocketPaylinkRepository = ReturnType<typeof createPocketPaylinkRepository>
export const pocketPaylinkRepository = createPocketPaylinkRepository()
