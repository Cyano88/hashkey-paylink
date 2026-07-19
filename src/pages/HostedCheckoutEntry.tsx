import { useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

type HostedCheckoutLookup = {
  ok?: boolean
  paymentUrl?: string
  error?: string
}

export default function HostedCheckoutEntry() {
  const { checkoutId = '' } = useParams()
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function openCheckout() {
      try {
        const response = await fetch(`/api/v2/checkouts?id=${encodeURIComponent(checkoutId)}`, { cache: 'no-store' })
        const body = await response.json().catch(() => undefined) as HostedCheckoutLookup | undefined
        if (!response.ok || !body?.ok || !body.paymentUrl?.startsWith('/pay?')) {
          throw new Error(body?.error || 'This checkout could not be opened.')
        }
        if (!cancelled) window.location.replace(body.paymentUrl)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'This checkout could not be opened.')
      }
    }
    void openCheckout()
    return () => { cancelled = true }
  }, [checkoutId])

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4">
      <section className="w-full max-w-sm rounded-[1.75rem] border border-gray-200 bg-white p-6 text-center shadow-[0_24px_70px_rgba(15,23,42,0.10)] dark:border-white/10 dark:bg-[#111216]">
        {error ? (
          <>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-400/10"><AlertCircle className="h-5 w-5" /></span>
            <h1 className="mt-4 text-lg font-bold text-gray-950 dark:text-white">Checkout unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{error}</p>
            <Link to="/" className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-gray-950 px-4 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">Hash PayLink</Link>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-gray-700 dark:text-white" />
            <h1 className="mt-4 text-lg font-bold text-gray-950 dark:text-white">Opening secure checkout</h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Verifying payment details…</p>
          </>
        )}
      </section>
    </main>
  )
}
