import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import PocketFlowHeader from './PocketFlowHeader'
import { PocketBillsSkeleton, PocketNotificationsSkeleton } from './PocketContentSkeletons'
import PocketRouteShell from './PocketRouteShell'
import type { PocketNavTab } from './PocketBottomNav'
import PocketActivityLoadingState from './PocketActivityLoadingState'

function Skeleton({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-lg bg-gray-200/85 motion-reduce:animate-none dark:bg-white/[0.08] ${className}`}
    />
  )
}

export default function PocketLoadingState({ active }: { active: PocketNavTab }) {
  const { pathname, search } = useLocation()
  const path = pathname.replace(/^\/pocket(?=\/|$)/, '')
  const feature = new URLSearchParams(search).get('feature')
  const layout = path.includes('/activity') ? 'activity' : path.includes('/notifications') || feature === 'notifications' ? 'notifications' : path.includes('/verify-name') ? 'bank' : path.includes('/profile') || path.endsWith('/account') ? feature ? 'form' : 'profile' : path.includes('/bills') ? 'bills' : path.endsWith('/deposit') ? 'deposit' : path.endsWith('/swap') || path.endsWith('/trade') ? 'swap' : path.endsWith('/transfer') || path.endsWith('/receive') ? 'menu' : path.includes('/pos') || path.endsWith('/request') || path.endsWith('/xpay') ? 'pos' : path.endsWith('/bank') ? 'bank' : path.endsWith('/send') || path.endsWith('/usdc') ? 'send' : path.endsWith('/scan') ? 'scan' : path.endsWith('/assistant') ? 'assistant' : path.endsWith('/market') || path.endsWith('/portfolio') ? 'list' : path.endsWith('/home') ? 'home' : 'form'
  const loadingKey = path + search
  const [visibleKey, setVisibleKey] = useState<string | null>(null)
  const visible = visibleKey === loadingKey
  useEffect(() => { const timer = window.setTimeout(() => setVisibleKey(loadingKey), 120); return () => clearTimeout(timer) }, [loadingKey])
  const title = feature === 'rates' ? 'Rates' : feature === 'limits' ? 'Spending limits' : feature === 'kyc' ? 'Identity verification' : feature === 'security' ? 'Payment security' : feature === 'wallet-setup' ? 'Wallet preparation' : layout === 'profile' ? 'Profile' : layout === 'send' || layout === 'menu' && path.endsWith('/transfer') ? 'Send' : layout === 'deposit' || layout === 'menu' ? 'Receive' : layout === 'bank' ? path.includes('verify-name') ? 'Verify bank name' : 'Bank transfer' : layout === 'swap' ? 'Swap' : layout === 'pos' ? 'POS' : layout === 'scan' ? 'Scan to pay' : layout === 'assistant' ? 'Support' : layout === 'notifications' ? 'Notifications' : layout === 'bills' ? 'Bills' : layout === 'activity' ? 'Activity' : 'Pocket'
  if (layout === 'activity' && visible) return <PocketActivityLoadingState />
  if (layout !== 'home' || !visible) return <div className="h-full min-h-0" aria-busy="true" aria-label={'Loading ' + title.toLowerCase()}>
    <PocketRouteShell active={active} navigationDisabled onSelect={() => undefined}>
      {layout !== 'home' && <PocketFlowHeader title={title} />}
      {visible && <section className="mt-7 space-y-5" data-pocket-skeleton={layout}>
        {layout === 'bills' ? <PocketBillsSkeleton /> : layout === 'notifications' ? <PocketNotificationsSkeleton /> : <div aria-hidden="true">
          {layout === 'profile' ? <><Skeleton className="mx-auto h-24 w-24 rounded-full" /><Skeleton className="mx-auto mt-4 h-4 w-32" /><div className="mt-8 space-y-3">{[0,1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-[22px]" />)}</div></> :
          layout === 'menu' || layout === 'list' ? <div className="space-y-3">{[0,1,2].map(i => <div key={i} className="flex items-center gap-4 rounded-[22px] bg-white p-5 dark:bg-[#121212]"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-3 w-40" /></div>)}</div> :
          layout === 'deposit' || layout === 'scan' ? <div className="space-y-6 rounded-[26px] bg-white p-5 dark:bg-[#121212]"><div className="flex justify-center gap-3">{[0,1,2,3].map(i => <Skeleton key={i} className="h-10 w-10 rounded-xl" />)}</div><Skeleton className="mx-auto h-44 w-44 rounded-2xl" /><Skeleton className="mx-auto h-3 w-48" /><Skeleton className="mx-auto h-12 w-40 rounded-full" /></div> :
          layout === 'assistant' ? <div className="space-y-6"><Skeleton className="h-16 w-4/5 rounded-2xl" /><Skeleton className="ml-auto h-12 w-3/5 rounded-2xl" /></div> : <div className="space-y-5 rounded-[26px] bg-white p-5 dark:bg-[#121212]">{Array.from({length: layout === 'swap' ? 2 : layout === 'pos' ? 2 : 3}, (_,i) => <div key={i} className="space-y-3"><Skeleton className="h-3 w-24" /><Skeleton className={layout === 'swap' ? 'h-28 w-full rounded-2xl' : 'h-12 w-full rounded-xl'} /></div>)}<Skeleton className="h-12 w-full rounded-full" /></div>}
        </div>}
      </section>}
    </PocketRouteShell>
  </div>
  return (
    <div className="h-full min-h-0" aria-busy="true" aria-label="Opening Pocket">
      <PocketRouteShell active={active} navigationDisabled onSelect={() => undefined}>
        <section className="space-y-5" aria-hidden="true" data-pocket-skeleton="home">
          <div className="overflow-hidden rounded-[28px] bg-gray-950 p-6 text-white shadow-[0_22px_60px_rgba(15,23,42,0.16)] dark:bg-white dark:text-gray-950">
            <Skeleton className="h-3 w-24 bg-white/20 dark:bg-gray-950/10" />
            <Skeleton className="mt-4 h-10 w-40 bg-white/20 dark:bg-gray-950/10" />
            <div className="mt-8 grid grid-cols-3 gap-3">
              <Skeleton className="h-11 bg-white/15 dark:bg-gray-950/[0.08]" />
              <Skeleton className="h-11 bg-white/15 dark:bg-gray-950/[0.08]" />
              <Skeleton className="h-11 bg-white/15 dark:bg-gray-950/[0.08]" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white px-2 py-3 dark:border-[#262626] dark:bg-[#121212] dark:shadow-none">
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-2.5 w-10" />
              </div>
            ))}
          </div>

          <div className="rounded-[24px] border border-gray-100 bg-white p-5 dark:border-[#262626] dark:bg-[#121212] dark:shadow-none">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-12" />
            </div>
            <div className="mt-5 space-y-4">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </PocketRouteShell>
    </div>
  )
}
