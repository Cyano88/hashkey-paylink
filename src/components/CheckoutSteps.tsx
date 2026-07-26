type CheckoutStepsProps = {
  steps: readonly [string, string, string]
  className?: string
}

export default function CheckoutSteps({ steps, className = '' }: CheckoutStepsProps) {
  return (
    <section className={className || 'mt-7'} aria-label="How it works">
      <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-widest text-gray-400">
        How it works
      </p>
      <div className="grid grid-cols-3 gap-2">
        {steps.map((title, index) => (
          <div
            key={`${index}-${title}`}
            className="rounded-xl border border-gray-100 bg-white p-3 text-center shadow-sm dark:border-white/[0.07] dark:bg-white/[0.04] dark:shadow-none"
          >
            <div className="mx-auto mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
              {index + 1}
            </div>
            <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-100">{title}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
