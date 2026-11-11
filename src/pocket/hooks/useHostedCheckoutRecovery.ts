import { useEffect, useRef } from 'react'

type PaidAttempt = { id: string; status: 'paid'; receiptId: string; transaction?: string }
// Only the server-verified, exact attempt may recover a lost confirmation response.
export default function useHostedCheckoutRecovery({ enabled, checkoutId, attemptId, onPaid }: {
  enabled: boolean; checkoutId: string; attemptId: string; onPaid: (attempt: PaidAttempt) => void
}) {
  const callback = useRef(onPaid)
  callback.current = onPaid
  useEffect(() => {
    if (!enabled || !checkoutId || !attemptId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    async function poll() {
      try {
        const response = await fetch(`/api/v2/checkouts?id=${encodeURIComponent(checkoutId)}&attempt=${encodeURIComponent(attemptId)}&purpose=return`, {
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        })
        const body = await response.json()
        const checkout = body?.checkout
        const attempt = checkout?.paymentAttempt
        if (!cancelled && response.ok && body?.ok && checkout?.id === checkoutId && checkout.status === 'paid' &&
          attempt?.id === attemptId && attempt.status === 'paid' && typeof attempt.receiptId === 'string' && attempt.receiptId) {
          callback.current(attempt)
          return
        }
      } catch { /* A temporary network failure must not change payment outcome. */ }
      if (!cancelled) timer = setTimeout(poll, 3_000)
    }
    void poll()
    return () => { cancelled = true; controller.abort(); if (timer) clearTimeout(timer) }
  }, [enabled, checkoutId, attemptId])
}
