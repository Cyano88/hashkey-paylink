import { useState } from 'react'
import type { PocketWalletUpdateNotice } from '../lib/pocketWalletUpdate'
export default function PocketWalletUpdateCard({ notice, onReview }: { notice: PocketWalletUpdateNotice; onReview(): void }) {
  const [dismissed, setDismissed] = useState(false)
  if (notice === 'hidden' || (dismissed && notice !== 'resume')) return null
  return <aside className='mt-4 flex items-center gap-3 rounded-2xl bg-gray-100 px-4 py-3 dark:bg-white/[0.06]'>
    <button type='button' onClick={onReview} className='min-h-11 flex-1 text-left'>
      <span className='block text-xs font-bold'>{notice === 'resume' ? 'Resume wallet update' : 'Wallet update available'}</span>
      <span className='mt-1 block text-[11px] text-gray-500'>{notice === 'resume' ? 'Your wallet update is unfinished. Continue from your saved progress.' : 'Review moving your previous wallet balance.'}</span>
    </button>
    {notice !== 'resume' && <button type='button' onClick={() => setDismissed(true)} aria-label='Dismiss wallet update' className='min-h-11 min-w-11 text-sm text-gray-400'>�</button>}
  </aside>
}
