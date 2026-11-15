import {BrandAttribution} from './BrandAttribution'
import { cn } from '../lib/utils'

export function CheckoutFooter() {
  return <footer aria-label="Checkout information" className="mt-5 text-center text-xs leading-5 text-gray-500 dark:text-gray-400">
    <BrandAttribution />
    <span className="flex items-center justify-center gap-x-2">
      <a href="https://docs.hashpaylink.com/docs/privacy" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline focus-visible:underline">Privacy</a>
      <span aria-hidden="true">&middot;</span>
      <a href="https://docs.hashpaylink.com/docs/terms" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline focus-visible:underline">Terms</a>
    </span>
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

export function CheckoutTrustLine({ className }: { className?: string; provider?: 'circle' | 'hashpaylink' }) {
  return <p className={cn('mt-5 pb-1 text-center text-[11px] text-gray-400 dark:text-gray-500', className)}><BrandAttribution /></p>
}
