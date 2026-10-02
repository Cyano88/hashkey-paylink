import './developer-loading-skeleton.css'

const Block = ({ className = '' }: { className?: string }) => <div className={`developer-shimmer rounded-lg ${className}`} />

export default function DeveloperLoadingSkeleton({ fullPage = false }: { fullPage?: boolean }) {
  return <div role="status" aria-label="Loading dashboard" aria-busy="true" className={`${fullPage ? 'min-h-screen' : 'min-h-[calc(100dvh-4rem)]'} bg-[#f5f5f7] dark:bg-[#0a0a0a]`}>
    <span className="sr-only">Loading dashboard</span>
    <div aria-hidden="true">
      {fullPage && <div className="flex h-16 items-center gap-4 border-b border-gray-200 bg-white px-5 dark:border-white/10 dark:bg-[#0a0a0a] sm:px-6"><Block className="h-8 w-8" /><Block className="h-5 w-32" /><Block className="ml-auto h-8 w-8" /></div>}
      <div className="flex h-12 items-center gap-6 overflow-hidden border-b border-gray-200 bg-white px-5 dark:border-white/10 dark:bg-[#0a0a0a] sm:px-8 xl:px-10">{[20, 24, 28].map(width => <Block key={width} className={`h-3 shrink-0 ${width === 20 ? 'w-20' : width === 24 ? 'w-24' : 'w-28'}`} />)}</div>
      <div className="px-5 py-7 sm:px-8 xl:px-10">
        <div className="border-b border-gray-200 pb-6 dark:border-white/10"><Block className="h-7 w-48" /><Block className="mt-3 h-4 w-64 max-w-full" /></div>
        <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map(index => <div key={index} className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-[#111216]"><Block className="h-10 w-10 rounded-xl" /><Block className="mt-5 h-4 w-36" /><Block className="mt-3 h-3 w-full" /><Block className="mt-2 h-3 w-3/4" /><Block className="mt-6 h-3 w-20" /></div>)}</div>
      </div>
    </div>
  </div>
}
