import { ArrowRight, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStreamPayPath } from '../lib/useStreamPayPath'

const sections = [
  {
    title: 'Who does what',
    body: 'The agreement creator defines the work, recipient, amount and release structure. The payer reviews those terms, funds the Arc escrow and controls approval of each release.',
  },
  {
    title: 'Payment structures',
    body: 'Use one release for a single final delivery, milestones for named deliverables, or progress releases for predetermined stages. The full amount is protected before work begins.',
  },
  {
    title: 'Delivery and approval',
    body: 'The recipient submits a delivery note and an HTTPS evidence link. The payer checks the evidence before approving. An approval is not inferred from a message or a browser redirect.',
  },
  {
    title: 'Issues and revisions',
    body: 'If the work needs changes, the payer reports an issue and the USDC remains protected. The recipient can update the delivery and request review again without creating a new agreement.',
  },
  {
    title: 'Cancellation and refunds',
    body: 'Cancellation follows the terms shown before funding. When an agreement expires with USDC remaining, the eligible payer can return the unreleased balance to the payer wallet.',
  },
  {
    title: 'Receipts and verification',
    body: 'HashPayStream shows a receipt only after the relevant Arc transaction is confirmed. Agreement updates come from signed Hash PayLink lifecycle webhooks and are processed idempotently.',
  },
]

export default function StreamPayDocs() {
  const createTo = useStreamPayPath('/agreements/new')

  return (
    <div className="w-full max-w-5xl py-12 sm:py-16">
      <div className="grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-16">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">HashPayStream guide</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Protected USDC agreements.</h1>
          <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">Everything a payer or recipient needs to use an agreement safely.</p>
          <Link to={createTo} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white">Create agreement<ArrowRight className="h-4 w-4" /></Link>
        </aside>

        <div>
          <section className="rounded-3xl border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-[#18181b] sm:p-8">
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Start here</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">One agreement, two distinct roles.</h2>
            <p className="mt-3 text-sm leading-7 text-gray-500 dark:text-gray-400">The recipient should not fund the same agreement they created. Send the private payer link to the person responsible for payment, and ask them to use their own email and Circle wallet session.</p>
          </section>

          <div className="mt-8 divide-y divide-gray-200 border-y border-gray-200 dark:divide-white/10 dark:border-white/10">
            {sections.map((section, index) => (
              <section key={section.title} className="grid gap-3 py-7 sm:grid-cols-[36px_1fr]">
                <span className="text-xs font-semibold text-gray-400">{String(index + 1).padStart(2, '0')}</span>
                <div><h2 className="text-lg font-semibold text-gray-950 dark:text-white">{section.title}</h2><p className="mt-2 text-sm leading-7 text-gray-500 dark:text-gray-400">{section.body}</p></div>
              </section>
            ))}
          </div>

          <section className="mt-10 rounded-3xl bg-gray-950 p-6 text-white dark:bg-white dark:text-gray-950 sm:p-8">
            <p className="text-xs font-semibold text-blue-400 dark:text-blue-600">For developers</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">Build your own agreement experience.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-300 dark:text-gray-600">HashPayStream uses Hash PayLink's authenticated Arc Agreement APIs and signed webhooks. Technical contracts, authentication and webhook verification remain in the Hash PayLink developer documentation.</p>
            <a href="https://app.hashpaylink.com/docs/streampay" target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">Open developer docs<ExternalLink className="h-4 w-4" /></a>
          </section>
        </div>
      </div>
    </div>
  )
}
