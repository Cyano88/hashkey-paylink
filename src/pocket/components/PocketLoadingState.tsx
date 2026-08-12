import PocketRouteShell from './PocketRouteShell'
import type { PocketNavTab } from './PocketBottomNav'

function Skeleton({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-lg bg-gray-200/85 motion-reduce:animate-none dark:bg-white/[0.08] ${className}`}
    />
  )
}

export default function PocketLoadingState({ active }: { active: PocketNavTab }) {
  return (
    <div aria-busy="true" aria-label="Opening Pocket">
      <PocketRouteShell active={active} navigationDisabled onSelect={() => undefined}>
        <section className="space-y-5" aria-hidden="true">
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
              <div key={index} className="flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white px-2 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-2.5 w-10" />
              </div>
            ))}
          </div>

          <div className="rounded-[24px] border border-gray-100 bg-white p-5 dark:border-white/[0.06] dark:bg-white/[0.03]">
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
