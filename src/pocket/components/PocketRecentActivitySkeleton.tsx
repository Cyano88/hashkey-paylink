import { PocketSkeletonBar as Bar } from './PocketContentSkeletons'

export default function PocketRecentActivitySkeleton() {
  return <div className="space-y-1" role="status" aria-label="Loading activity" aria-busy="true">
    {Array.from({ length: 4 }).map((_, index) => <div key={index} className="flex items-center gap-3 rounded-2xl px-2 py-3">
      <Bar className="h-9 w-9 shrink-0 rounded-full" />
      <span className="min-w-0 flex-1 space-y-2"><Bar className="h-3 w-28" /><Bar className="h-2.5 w-16" /></span>
      <Bar className="h-3 w-16" />
    </div>)}
  </div>
}
