import PocketFlowHeader from '../../components/PocketFlowHeader'
import { GiftIcon } from '@heroicons/react/24/outline'
import { CPurseIcon } from '../../components/CPurseIcon'
import PocketBottomSheet from '../../components/PocketBottomSheet'
import PocketNetworkMark from '../../components/PocketNetworkMark'
import { giftStateCopy, type GiftView } from './pocketGift'

export function PocketGiftArtwork({ compact = false }: { compact?: boolean }) {
  return <div aria-hidden="true" className={`flex items-center justify-center rounded-[28px] border border-gray-200 bg-[#efefec] text-gray-950 dark:border-[#262626] dark:bg-[#171717] dark:text-white ${compact ? 'mx-auto h-28 w-28' : 'aspect-[3/2] w-full'}`}>
    <GiftIcon className={compact ? 'h-16 w-16' : 'h-28 w-28'} strokeWidth={1.15} />
  </div>
}
function GiftDetails({ gift }: { gift: GiftView }) {
  return <><h1 className="mt-7 text-2xl font-bold tracking-tight">A gift for you</h1><p className="mt-3 text-3xl font-bold tabular-nums">{gift.amount} <span className="text-base font-medium">USDC</span></p><p className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400"><PocketNetworkMark network={gift.network} /><span className="capitalize">{gift.network}</span></p><p className="mt-5 text-sm text-gray-600 dark:text-gray-300">From {gift.sender}</p>{gift.message && <p className="mx-auto mt-4 max-w-xs break-words text-sm leading-6 text-gray-500 dark:text-gray-400">{gift.message}</p>}</>
}
export function PocketGiftLanding({ gift, onRedeem, onCopyCode, onBack, onDone }: { onDone?: () => void; onBack?: () => void; gift: GiftView; onRedeem: () => void; onCopyCode?: () => void }) {
  const available = gift.status === 'available'
  return <main data-pocket-colour-scope="stablecoins" className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pb-8 pt-[max(1.5rem,var(--pocket-safe-top))] text-center text-gray-950 dark:text-white">
    <div className="mb-8">{onBack?<PocketFlowHeader title="Claim a gift" onBack={onBack}/>:<p className="flex items-center justify-center gap-2 text-sm font-bold"><CPurseIcon size={26} title="" />Pocket</p>}</div>
    <PocketGiftArtwork /><GiftDetails gift={gift} />
    {available ? <div className="mt-8"><button type="button" onClick={onRedeem} className="pocket-cta-primary w-full">Redeem in Pocket</button>{onCopyCode && <button type="button" onClick={onCopyCode} className="mt-4 min-h-11 px-3 text-xs text-gray-500 dark:text-gray-400">Copy gift code</button>}</div> : <p role="status" className="mt-8 text-sm text-gray-500 dark:text-gray-400">{giftStateCopy(gift.status)}</p>}
    {onDone&&<div className="mt-auto pt-8"><button type="button" className="pocket-cta-primary w-full" onClick={onDone}>Done</button></div>}
  </main>
}
export function PocketGiftClaimSheet({ gift, onClose, onClaim, busy = false, error = '' }: { gift: GiftView; onClose: () => void; onClaim: () => void; busy?: boolean; error?: string }) {
  return <PocketBottomSheet title="Claim gift" onClose={onClose} dismissOnBackdrop={false} dismissible={!busy}>
    <section className="pb-1 text-center"><PocketGiftArtwork compact /><GiftDetails gift={gift} />
      {error && <p role="alert" className="mt-4 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {gift.status === 'available' ? <button type="button" disabled={busy} onClick={onClaim} className="pocket-cta-primary mt-7 w-full disabled:opacity-50">{busy ? 'Claiming…' : 'Claim gift'}</button> : <p role="status" className="mt-6 text-sm text-gray-500 dark:text-gray-400">{giftStateCopy(gift.status)}</p>}
    </section>
  </PocketBottomSheet>
}
