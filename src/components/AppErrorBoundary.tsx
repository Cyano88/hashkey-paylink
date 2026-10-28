import React, {type ReactNode} from 'react'
import {CheckoutFooter,HashPayLinkCheckoutBrand} from './CheckoutChrome'

export default class AppErrorBoundary extends React.Component<{ children: ReactNode; checkout?: boolean }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[hashpaylink:error-boundary]', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    if (this.props.checkout) return <main className="min-h-screen bg-white px-4 py-12 text-gray-950">
      <div className="mx-auto w-full max-w-md">
        <HashPayLinkCheckoutBrand/>
        <section className="rounded-3xl border border-gray-200 p-6 text-center">
          <h1 className="text-xl font-semibold">Checkout could not load</h1>
          <p className="mt-3 text-sm leading-6 text-gray-500">Check your connection and reload to continue.</p>
          <button type="button" onClick={()=>window.location.reload()} className="mt-6 min-h-12 w-full rounded-full bg-gray-950 px-4 text-sm font-semibold text-white">Reload checkout</button>
        </section>
        <CheckoutFooter/>
      </div>
    </main>
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 font-inter text-gray-950 dark:bg-[#0f1014] dark:text-white">
        <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-white/10 dark:bg-[#111216]">
          <p className="text-[11px] font-bold uppercase tracking-widest text-red-500">Hash PayLink</p>
          <h1 className="mt-2 text-xl font-black tracking-tight">Something failed to open</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Refresh and try again. If it repeats, send this message to support.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-gray-50 p-3 text-xs text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
            {this.state.error.message}
          </pre>
        </section>
      </main>
    )
  }
}

