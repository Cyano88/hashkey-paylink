// One deadline covers session acquisition, transport and response decoding.
export async function boundedCheckoutRequest<T>(parent: AbortSignal, task: (signal: AbortSignal) => Promise<T>, timeoutMs = 30000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: (error: Error) => void = () => {};
  const cancel = () => { controller.abort(); rejectAbort(new Error('Your checkout session changed. Reopen checkout.')); };
  const stop = new Promise<never>((_, reject) => {
    rejectAbort = reject;
    timer = setTimeout(() => { controller.abort(); reject(new Error('Checkout is taking too long. Please try again.')); }, timeoutMs);
  });
  parent.addEventListener('abort', cancel, { once: true });
  try {
    if (parent.aborted) { cancel(); return await stop; }
    return await Promise.race([task(controller.signal), stop]);
  } finally { clearTimeout(timer); parent.removeEventListener('abort', cancel); }
}
