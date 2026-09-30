import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/plus-jakarta-sans/800.css'
import '../../../index.css'
import '../../pocketTheme.css'
import PocketGiftCreate from './PocketGiftCreate'
import { PocketGiftLanding, PocketGiftClaimSheet } from './PocketGiftExperience'
import { type GiftView, type GiftStatus } from './pocketGift'
function Preview() {
  const [create, setCreate] = useState(false), [sheet, setSheet] = useState(false), [error, setError] = useState('')
  const [gift, setGift] = useState<GiftView>({ sender: '@shy', amount: '10', network: 'arbitrum', message: 'Something to make your day.', status: 'available' })
  return <><aside className="flex flex-wrap items-center justify-center gap-3 border-b border-gray-200 bg-white p-3 text-xs text-gray-600 dark:border-[#262626] dark:bg-black dark:text-gray-400"><span>Design preview · No funds move</span><button onClick={() => setCreate(!create)}>{create ? 'Gift page' : 'Create gift'}</button><button onClick={() => document.documentElement.classList.toggle('dark')}>Theme</button><select aria-label="Preview gift state" value={gift.status} onChange={e => setGift({ ...gift, status: e.target.value as GiftStatus })}>{['available','funding','claimed','expired','refunding','refunded'].map(s => <option key={s}>{s}</option>)}</select></aside>
    {create ? <PocketGiftCreate onBack={() => setCreate(false)} onContinue={draft => {setGift({ ...gift, ...draft, status: 'available' }); setCreate(false)}} /> : <PocketGiftLanding gift={gift} onRedeem={() => {setError('');setSheet(true)}} />}
    {sheet && <PocketGiftClaimSheet gift={gift} error={error} onClose={() => setSheet(false)} onClaim={() => setError('Preview only. Funding and claims are not enabled.')} />}
  </>
}
// Deliberately not a production route or app-menu entry.
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<BrowserRouter><Preview /></BrowserRouter>)
