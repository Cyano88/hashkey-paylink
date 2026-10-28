import { cn } from '../lib/utils'

export function CheckoutFooter() {
  return <footer aria-label="Checkout information" className="mt-5 flex flex-wrap items-center justify-center gap-x-2 text-center text-xs leading-5 text-gray-500 dark:text-gray-400">
    <span>Powered by <strong className="font-semibold text-gray-950 dark:text-white">Hash PayLink</strong></span>
    <span aria-hidden="true">&middot;</span>
    <a href="https://docs.hashpaylink.com/docs/privacy" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline focus-visible:underline">Privacy</a>
    <span aria-hidden="true">&middot;</span>
    <a href="https://docs.hashpaylink.com/docs/terms" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline focus-visible:underline">Terms</a>
  </footer>
}

export function HashPayLinkCheckoutBrand({ className }: { className?: string }) {
  return (
    <div aria-label="Hash PayLink" className={cn('mb-6 flex items-center justify-center gap-1 sm:mb-7', className)}>
      <img src="/hash-logo-transparent.png" alt="" className="h-8 w-8 object-contain dark:invert" />
      <span className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
        Hash <span className="text-[#0071E3]">PayLink</span>
      </span>
    </div>
  )
}

export function CheckoutTrustLine({ className, provider = 'circle' }: { className?: string; provider?: 'circle' | 'hashpaylink' }) {
  if (provider === 'hashpaylink') {
    return (
      <p
        aria-label="Powered by Hash PayLink"
        className={cn('mt-5 flex items-center justify-center gap-1.5 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500', className)}
      >
        <span>Powered by</span>
        <span aria-hidden="true" className="grid h-3.5 w-3.5 place-items-center overflow-hidden bg-[#05060f]">
          <img src="/hash-logo-modal-dark.png" alt="" className="h-[9px] w-[9px] object-contain" />
        </span>
        <span>Hash PayLink</span>
      </p>
    )
  }
  return (
    <p className={cn('mt-5 pb-1 text-center text-[11px] font-medium text-gray-400 dark:text-gray-500', className)}>
      Powered by <strong className="font-semibold text-gray-500 dark:text-gray-400">Circle USDC</strong>
    </p>
  )
}
