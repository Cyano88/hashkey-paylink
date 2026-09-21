export type PocketRefreshHandler = () => Promise<unknown> | unknown

const handlers = new Set<PocketRefreshHandler>()
let inFlight: Promise<void> | undefined
export function registerPocketRefreshHandler(handler: PocketRefreshHandler) {
  handlers.add(handler)
  return () => { handlers.delete(handler) }
}

/** All refresh gestures share completion of the actual registered reads. */
export function refreshPocketData(): Promise<void> {
  if (inFlight) return inFlight
  const work = Promise.allSettled(Array.from(handlers, async handler => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        Promise.resolve().then(handler),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Refresh deadline exceeded.')), 20_000) }),
      ])
    } finally { clearTimeout(timer) }
  })).then(results => {
    if (results.some(result => result.status === 'rejected')) throw new Error('Some data could not finish refreshing.')
  }).finally(() => { if (inFlight === work) inFlight = undefined })
  inFlight = work
  return work
}
