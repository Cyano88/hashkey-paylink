import { cn } from '../lib/utils'

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

export function CheckoutTrustLine({ className }: { className?: string }) {
  return (
    <p className={cn('mt-5 pb-1 text-center text-[11px] font-medium text-gray-400 dark:text-gray-500', className)}>
      Powered by <strong className="font-semibold text-gray-500 dark:text-gray-400">Circle USDC</strong>
    </p>
  )
}
