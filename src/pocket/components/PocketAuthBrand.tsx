import type { Ref } from 'react'
import { CPurseIcon } from './CPurseIcon'

export default function PocketAuthBrand({ compact = false, markRef }: { compact?: boolean; markRef?: Ref<HTMLSpanElement> }) {
  return (
    <div className="flex items-center justify-center" aria-label="Pocket by Hash PayLink">
      <span ref={markRef} className={compact ? 'h-[34px] w-[34px] shrink-0' : 'h-11 w-11 shrink-0'}>
        <CPurseIcon size="100%" title="" className="h-full w-full text-gray-950" />
      </span>
      <div className="ml-2.5 text-left">
        <p className={`${compact ? 'text-lg' : 'text-[22px]'} font-black leading-none tracking-[-0.04em] text-gray-950`}>Pocket</p>
        <p className={`mt-1 font-bold uppercase leading-none tracking-[0.18em] text-gray-400 ${compact ? 'text-[8px]' : 'text-[9px]'}`}>By Hash PayLink</p>
      </div>
    </div>
  )
}
