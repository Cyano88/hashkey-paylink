export function PocketSkeletonBar({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-lg bg-gray-200/80 motion-reduce:animate-none dark:bg-white/[0.08] ${className}`} />
}

export function PocketLoadingField({ label, cards = false }: { label: string; cards?: boolean }) {
  return <div role="status" aria-label={label} aria-busy="true" className={cards ? 'mt-2 grid grid-cols-2 gap-2' : 'mt-2'}>
    {cards ? [0, 1, 2, 3].map(index => <div key={index} className="space-y-3 rounded-2xl border border-gray-100 p-3 dark:border-[#262626]"><PocketSkeletonBar className="h-3 w-3/4" /><PocketSkeletonBar className="h-3 w-1/2" /></div>) : <PocketSkeletonBar className="h-12 w-full rounded-xl" />}
    <span className="sr-only">{label}</span>
  </div>
}

export function PocketBillsSkeleton() {
  return <section role="status" aria-label="Loading bills" aria-busy="true" className="space-y-4">
    <span className="sr-only">Loading bills</span>
    <div aria-hidden="true" className="flex items-center justify-between rounded-[22px] bg-white p-4 shadow-sm dark:bg-[#121212] dark:shadow-none"><div className="space-y-2"><PocketSkeletonBar className="h-2.5 w-24" /><PocketSkeletonBar className="h-3 w-32" /></div><PocketSkeletonBar className="h-5 w-20" /></div>
    <div aria-hidden="true" className="space-y-5 rounded-[22px] bg-white p-4 shadow-sm dark:bg-[#121212] dark:shadow-none">
      {[0, 1, 2].map(index => <div key={index} className="space-y-2"><PocketSkeletonBar className="h-2.5 w-24" /><PocketSkeletonBar className="h-12 w-full rounded-xl" /></div>)}
      <PocketSkeletonBar className="h-12 w-full rounded-full" />
    </div>
  </section>
}

export function PocketNotificationsSkeleton() {
  return <section role="status" aria-label="Loading notifications" aria-busy="true" className="mt-7 space-y-3">
    <span className="sr-only">Loading notifications</span>
    {[0, 1, 2].map(index => <div key={index} aria-hidden="true" className="space-y-3 rounded-[24px] bg-white p-4 shadow-sm dark:bg-[#121212] dark:shadow-none">
      <div className="flex items-center justify-between gap-4"><PocketSkeletonBar className="h-3 w-36" /><PocketSkeletonBar className="h-5 w-20 rounded-full" /></div>
      <PocketSkeletonBar className="h-2.5 w-28" /><PocketSkeletonBar className="h-2.5 w-40" /><PocketSkeletonBar className="h-6 w-24" />
    </div>)}
  </section>
}
