import {hasRenderDurableStore, readDurableJson, mutateDurableJson} from '../render-durable-store.js'
import {createPaylinkRequestFileStore, PaylinkRequestStorageError, validatePaylinkRequestStore} from './paylink-request-file-store.js'
export const PAYLINK_REQUEST_STORE_KEY = 'hashpaylink:pocket-paylink-requests:v1'
type Store<T> = {requests: Record<string, T>}
type Options = {
  durable?: boolean
  production?: boolean
  storePath?: string
  readDurable?: typeof readDurableJson
  mutateDurable?: typeof mutateDurableJson
}
export function createPaylinkRequestStore<T>(options: Options = {}) {
  const durable = options.durable ?? hasRenderDurableStore()
  const production = options.production ?? Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL || process.env.NODE_ENV === 'production')
  const local = createPaylinkRequestFileStore<T>(options.storePath ?? process.env.TELEGRAM_REQUEST_STORE ?? './data/telegram-requests.json')
  const readRemote = options.readDurable ?? readDurableJson
  const mutateRemote = options.mutateDurable ?? mutateDurableJson
  const normalize = (value: unknown): Store<T> => value === undefined ? {requests:{}} : validatePaylinkRequestStore<T>(value)
  return {
    async read(): Promise<Store<T>> {
      if(!durable) { if(production) throw new PaylinkRequestStorageError(); return local.read() }
      try { return normalize(await readRemote(PAYLINK_REQUEST_STORE_KEY)) }
      catch { throw new PaylinkRequestStorageError() }
    },
    async mutate<R>(mutation: (store: Store<T>) => R | Promise<R>): Promise<R> {
      if(!durable) { if(production) throw new PaylinkRequestStorageError(); return local.mutate(mutation) }
      let result!: R
      try {
        await mutateRemote<Store<T>>(PAYLINK_REQUEST_STORE_KEY, async current => {
          const store = normalize(current)
          result = await mutation(store)
          return validatePaylinkRequestStore<T>(store)
        })
        return result
      } catch { throw new PaylinkRequestStorageError() }
    },
  }
}
