export default function PocketProgressDots({ label }: { label: string }) {
  return (
    <span className="mt-7 inline-flex items-center justify-center gap-1.5" role="status" aria-label={label}>
      {[0, 160, 320].map(delay => (
        <span
          key={delay}
          aria-hidden="true"
          className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-600 motion-reduce:animate-none"
          style={{ animationDelay: `${delay}ms`, animationDuration: '960ms' }}
        />
      ))}
    </span>
  )
}
