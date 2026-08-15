export type PocketRefreshHandler = () => Promise<unknown> | unknown

const handlers = new Set<PocketRefreshHandler>()

export function registerPocketRefreshHandler(handler: PocketRefreshHandler) {
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}

export async function refreshPocketData() {
  await Promise.allSettled(Array.from(handlers, handler => Promise.resolve().then(handler)))
}
