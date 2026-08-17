import PocketRouteShell from './PocketRouteShell'

function Bar({ className }: { className: string }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-lg bg-gray-200/85 [animation-duration:700ms] motion-reduce:animate-none dark:bg-white/[0.08] ${className}`} />
}

export default function PocketActivityLoadingState() {
  return <div aria-busy="true" aria-label="Loading activity">
    <PocketRouteShell active="activity" navigationDisabled onSelect={() => undefined}>
      <section className="space-y-5" aria-hidden="true">
        <div className="flex items-center justify-between px-1"><Bar className="h-3 w-16" /><Bar className="h-8 w-8 rounded-full" /></div>
        <section>
          <Bar className="h-3 w-24" />
          <div className="mt-2 overflow-hidden rounded-2xl border border-gray-100 bg-white px-4 dark:border-white/10 dark:bg-[#111216]">
            {Array.from({ length: 4 }).map((_, index) => <div key={index} className="flex min-h-[72px] items-center gap-3 border-b border-gray-100 last:border-b-0 dark:border-white/[0.07]">
              <Bar className="h-10 w-10 shrink-0 rounded-full" />
              <span className="min-w-0 flex-1 space-y-2"><Bar className="h-3 w-32" /><Bar className="h-2.5 w-20" /></span>
              <span className="space-y-2"><Bar className="ml-auto h-3 w-16" /><Bar className="ml-auto h-2.5 w-12" /></span>
            </div>)}
          </div>
        </section>
      </section>
    </PocketRouteShell>
  </div>
}
