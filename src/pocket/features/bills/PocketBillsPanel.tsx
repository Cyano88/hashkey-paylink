import type { ReactNode } from 'react'
import { ArrowRight, Lightbulb, Mail, Phone, Tv, Wifi } from 'lucide-react'
import { PrivyConnectButton } from '../../../lib/PrivyConnectButton'

export type PocketBillView = 'airtime' | 'data' | 'tv' | 'electricity'

type PocketBillsPanelProps = {
  view: PocketBillView
  authenticated: boolean
  profileSlot?: ReactNode
}

const billMeta = {
  airtime: { title: 'Airtime', body: 'Top up a Nigerian mobile number from Circle Pocket.', icon: Phone },
  data: { title: 'Mobile data', body: 'Choose a network and data bundle for a Nigerian mobile number.', icon: Wifi },
  tv: { title: 'TV', body: 'Renew a supported decoder or smartcard subscription.', icon: Tv },
  electricity: { title: 'Electricity', body: 'Validate a meter and pay a supported electricity provider.', icon: Lightbulb },
} as const

export default function PocketBillsPanel({ view, authenticated, profileSlot }: PocketBillsPanelProps) {
  const meta = billMeta[view]
  const BillIcon = meta.icon

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-white via-white to-amber-50/70 p-4 shadow-sm dark:border-white/10 dark:from-[#111216] dark:via-[#111216] dark:to-amber-500/[0.08]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Bills</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-gray-950 dark:text-white">{meta.title}</h2>
            <p className="mt-1 max-w-xs text-xs leading-5 text-gray-500 dark:text-gray-400">{meta.body}</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white/80 text-gray-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300">
            <BillIcon className="h-[18px] w-[18px]" />
          </span>
        </div>
      </div>

      {authenticated && profileSlot}

      <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm dark:border-white/10 dark:bg-[#111216]">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-300">
          <BillIcon className="h-5 w-5" />
        </span>
        <h3 className="mt-3 text-sm font-black text-gray-900 dark:text-gray-100">Provider connection pending</h3>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-gray-500 dark:text-gray-400">
          {meta.title} checkout will open here after the biller catalog, customer validation, and durable receipt flow pass verification.
        </p>
      </div>

      {!authenticated && (
        <div className="overflow-hidden rounded-[26px] border border-gray-200 bg-[#F5F5F7]/95 p-2 shadow-[0_12px_36px_rgba(15,23,42,0.1)] dark:border-white/10 dark:bg-[#151518]/95 dark:shadow-[0_16px_44px_rgba(0,0,0,0.3)]">
          <PrivyConnectButton className="group relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 py-1.5 text-center text-sm font-semibold text-white shadow-sm transition-all hover:bg-black active:scale-[0.98] disabled:opacity-60 dark:bg-white/[0.12] dark:text-white dark:hover:bg-white/[0.16]">
            <Mail className="absolute left-5 h-4 w-4" />
            <span>Sign in to Bills</span>
            <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition-transform group-hover:translate-x-0.5">
              <ArrowRight className="h-4 w-4" />
            </span>
          </PrivyConnectButton>
          <p className="px-3 pb-1 pt-2 text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">Secure access keeps bill history, receipts, reversals, and support records connected.</p>
        </div>
      )}
    </div>
  )
}
