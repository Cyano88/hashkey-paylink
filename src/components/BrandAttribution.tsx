import {poweredByHashPayLink,paymentTagline} from '../lib/brandCopy'
/** Shared product attribution for checkout, receipts and exports. */
export function BrandAttribution(){
  return <span className="block text-center normal-case tracking-normal leading-relaxed"><span className="block font-medium">{poweredByHashPayLink}</span><span className="block text-[0.9em] font-normal">{paymentTagline}</span></span>
}
