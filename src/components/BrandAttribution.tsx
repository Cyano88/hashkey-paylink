import {poweredByHashPayLink,paymentTagline} from '../lib/brandCopy'
/** Shared product attribution for checkout, receipts and exports. */
export function BrandAttribution(){
  return <span className="block text-center normal-case tracking-normal leading-relaxed"><span className="flex items-center justify-center font-medium"><img src="/hash-logo-transparent.png" alt="" aria-hidden="true" width="28" height="28" className="h-7 w-7 shrink-0 object-contain dark:invert" data-brand-attribution-icon/>{poweredByHashPayLink}</span><span className="block text-[0.9em] font-normal">{paymentTagline}</span></span>
}
