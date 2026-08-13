import { ArrowRight, Check, FileCheck2, ShieldCheck, WalletCards } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStreamPayPath } from '../lib/useStreamPayPath'

const steps = [
  { number: '01', title: 'Set the terms', detail: 'Describe the work, amount, recipient and release structure.' },
  { number: '02', title: 'Fund the agreement', detail: 'The payer reviews the terms and protects the full USDC amount on Arc.' },
  { number: '03', title: 'Approve delivery', detail: 'Funds release only after the payer reviews the completed work.' },
]

const structures = [
  { title: 'One release', detail: 'For a single delivery with one final approval.', icon: WalletCards },
  { title: 'Milestones', detail: 'Split payment across clearly defined deliverables.', icon: FileCheck2 },
  { title: 'Progress releases', detail: 'Release a fixed share as the work advances.', icon: ShieldCheck },
]

export default function StreamPayLanding() {
  const createTo = useStreamPayPath('/agreements/new')
  const docsTo = useStreamPayPath('/docs')

  return (
    <div className="w-full max-w-6xl">
      <section className="grid min-h-[72vh] items-center gap-12 py-16 lg:grid-cols-[1.05fr_.95fr] lg:py-24">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            Arc Testnet private pilot
          </div>
          <h1 className="mt-7 text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.045em] text-gray-950 dark:text-white sm:text-6xl lg:text-7xl">
            USDC payments protected until the work is approved.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-gray-500 dark:text-gray-400 sm:text-lg">
            Create a clear agreement, protect the payment on Arc, and release USDC as each delivery is accepted.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link to={createTo} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-5 py-3.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 dark:bg-white dark:text-gray-950">
              Create an agreement
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to={docsTo} className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-3.5 text-sm font-semibold text-gray-800 transition-colors hover:border-gray-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:hover:border-white/20">
              See how it works
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-400">
            {['Circle wallets', 'USDC settlement', 'Signed lifecycle events'].map(item => (
              <span key={item} className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" />{item}</span>
            ))}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-lg">
          <div className="absolute -inset-10 -z-10 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.16),transparent_68%)]" />
          <div className="overflow-hidden rounded-[2rem] border border-gray-200 bg-white shadow-[0_30px_90px_-45px_rgba(15,23,42,0.38)] dark:border-white/10 dark:bg-[#18181b]">
            <div className="border-b border-gray-100 px-6 py-5 dark:border-white/10">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-950 dark:text-white">Product delivery</p>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">Protected</span>
              </div>
              <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-400">Protected amount</p>
              <p className="mt-1 text-4xl font-semibold tracking-tight text-gray-950 dark:text-white">250 USDC</p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-gray-100 border-b border-gray-100 dark:divide-white/10 dark:border-white/10">
              <div className="p-5"><p className="text-[10px] uppercase tracking-[0.14em] text-gray-400">Released</p><p className="mt-2 text-lg font-semibold text-gray-950 dark:text-white">100 USDC</p></div>
              <div className="p-5"><p className="text-[10px] uppercase tracking-[0.14em] text-gray-400">Remaining</p><p className="mt-2 text-lg font-semibold text-gray-950 dark:text-white">150 USDC</p></div>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white"><FileCheck2 className="h-4 w-4" /></span>
                <div><p className="text-sm font-semibold text-gray-950 dark:text-white">Final build ready</p><p className="mt-0.5 text-xs text-gray-400">Waiting for payer review</p></div>
              </div>
              <div className="mt-5 flex h-11 items-center justify-center rounded-xl bg-gray-950 text-xs font-semibold text-white dark:bg-white dark:text-gray-950">Review delivery</div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-t border-gray-200 py-20 dark:border-white/10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">How it works</p>
        <div className="mt-4 grid gap-10 lg:grid-cols-[.7fr_1.3fr]">
          <h2 className="max-w-md text-3xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-4xl">A clear payment process for both sides.</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {steps.map(step => (
              <article key={step.number} className="border-t-2 border-gray-950 pt-5 dark:border-white">
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">{step.number}</p>
                <h3 className="mt-5 text-base font-semibold text-gray-950 dark:text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{step.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 pb-20 sm:grid-cols-3">
        {structures.map(item => (
          <article key={item.title} className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-white/[0.035]">
            <item.icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="mt-7 text-lg font-semibold text-gray-950 dark:text-white">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="mb-16 overflow-hidden rounded-[2rem] bg-gray-950 px-6 py-12 text-white dark:bg-white dark:text-gray-950 sm:px-10 sm:py-16">
        <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-end">
          <div><p className="text-xs font-semibold text-blue-400 dark:text-blue-600">Built on Hash PayLink infrastructure</p><h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">Make the work clear before the money moves.</h2></div>
          <Link to={createTo} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-3.5 text-sm font-semibold text-gray-950 dark:bg-gray-950 dark:text-white">Create agreement<ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </div>
  )
}
