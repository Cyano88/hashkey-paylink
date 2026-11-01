/** Read-only checkout progress. Payment recovery remains owned by the server. */
export function startVisibleCheckoutPoll(read: (signal: AbortSignal) => Promise<boolean>, fail: (error: unknown, timedOut: boolean) => void, page: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> = document) {
  let stopped = false, running = false, resume = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let active: AbortController | undefined
  const visible = () => page.visibilityState === 'visible'
  const schedule = (delay: number) => {
    clearTimeout(timer)
    if (!stopped && visible()) timer = setTimeout(() => void run(), delay)
  }
  async function run() {
    if (stopped || running || !visible()) return
    running = true; resume = false
    const controller = new AbortController(); active = controller
    let timedOut = false, repeat = false
    const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 15_000)
    try {
      repeat = await read(controller.signal)
      if (!controller.signal.aborted && !repeat) stopped = true
    } catch (error) {
      if (!stopped && visible() && (!controller.signal.aborted || timedOut)) {
        stopped = true; fail(error, timedOut)
      }
    } finally {
      clearTimeout(timeout); running = false; active = undefined
      if (resume) schedule(0)
      else if (repeat) schedule(10_000)
    }
  }
  const visibility = () => {
    clearTimeout(timer)
    if (!visible()) active?.abort()
    else if (running) resume = true
    else schedule(0)
  }
  page.addEventListener('visibilitychange', visibility)
  void run()
  return () => { stopped = true; clearTimeout(timer); active?.abort(); page.removeEventListener('visibilitychange', visibility) }
}
