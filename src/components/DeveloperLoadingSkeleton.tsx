import './developer-loading-skeleton.css'

const Block = ({ className = '' }: { className?: string }) => <div className={`developer-shimmer rounded-lg ${className}`} />

export default function DeveloperLoadingSkeleton({ fullPage = false }: { fullPage?: boolean }) {
  return <div role="status" aria-label="Loading dashboard" aria-busy="true" className={`${fullPage ? 'min-h-screen' : 'min-h-[calc(100dvh-4rem)]'} bg-[#f5f5f7] dark:bg-[#0a0a0a]`}>
    <span className="sr-only">Loading dashboard</span>
    <div aria-hidden="true">
      {fullPage && <div className="flex h-16 items-center gap-4 border-b border-gray-200 bg-white px-5 dark:border-white/10 dark:bg-[#0a0a0a] sm:px-6"><Block className="h-7 w-7" /><Block className="h-5 w-32" /><Block className="ml-auto h-8 w-8 rounded-full" /></div>}
      <div className="flex min-h-[calc(100dvh-4rem)]">
        <div className="hidden w-56 shrink-0 space-y-6 border-r border-gray-200 bg-white px-6 py-8 dark:border-white/10 dark:bg-[#0a0a0a] lg:block">
          {[0, 1, 2, 3].map(item => <div key={item} className="flex items-center gap-3"><Block className="h-5 w-5" /><Block className="h-3 w-28" /></div>)}
        </div>
        <div className="min-w-0 flex-1 px-5 py-7 sm:px-8 xl:px-10">
          <div className="mb-7 flex gap-4 lg:hidden"><Block className="h-5 w-5" /><Block className="h-4 w-28" /></div>
          <Block className="h-7 w-52 max-w-full" /><Block className="mt-3 h-4 w-72 max-w-full" />
          <div className="mt-8 grid gap-4 sm:grid-cols-3">{[0, 1, 2].map(item => <div key={item} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#111216]"><Block className="h-3 w-24" /><Block className="mt-4 h-7 w-32 max-w-full" /></div>)}</div>
          <div className="mt-7 rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#111216]">
            <Block className="mb-6 h-5 w-32" />
            {[0, 1, 2, 3].map(item => <div key={item} className="flex items-center gap-4 border-t border-gray-100 py-5 dark:border-white/5"><Block className="h-9 w-9 shrink-0 rounded-full" /><div className="min-w-0 flex-1"><Block className="h-3 w-40 max-w-full" /><Block className="mt-2 h-3 w-24" /></div><Block className="h-4 w-16 shrink-0" /></div>)}
          </div>
        </div>
      </div>
    </div>
  </div>
}
