import type { Ref } from 'react'

export default function PocketAuthBrand({ compact = false, markRef }: { compact?: boolean; markRef?: Ref<HTMLSpanElement> }) {
  return <div className="flex flex-col items-center" aria-label="Pocket by Hash PayLink">
    <span ref={markRef} className={compact ? 'block w-32' : 'block w-40'}>
      <img src="/pocket-wordmark.svg" alt="" className="block h-auto w-full dark:invert" />
    </span>
    <p className="mt-2 text-[9px] font-semibold uppercase leading-none tracking-[0.18em] text-gray-400">By Hash PayLink</p>
  </div>
}
