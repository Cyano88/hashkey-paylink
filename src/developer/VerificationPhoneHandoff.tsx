import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

export function verificationPhoneUrl(location: string, level: 'basic' | 'advanced', country: 'NG' | 'UG', method: 'nin' | 'government_id' = 'nin') {
  const current = new URL(location)
  const link = new URL(current.pathname, current.origin)
  for (const key of ['project', 'profile']) {
    const value = current.searchParams.get(key)
    if (value) link.searchParams.set(key, value)
  }
  link.searchParams.set('environment', 'live')
  link.searchParams.set('section', 'verification')
  link.searchParams.set('level', level)
  link.searchParams.set('verificationCountry', country)
  if (country === 'NG' && level === 'advanced') link.searchParams.set('verificationMethod', method)
  link.searchParams.set('continueOnPhone', '1')
  return link.toString()
}

export default function VerificationPhoneHandoff({ level, country, method, open, onOpenChange }: {
  level: 'basic' | 'advanced'; country: 'NG' | 'UG'; method: 'nin' | 'government_id'; open: boolean; onOpenChange: (open: boolean) => void
}) {
  const [copyStatus, setCopyStatus] = useState('')
  const link = verificationPhoneUrl(window.location.href, level, country, method)
  return <div className="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
    <button type="button" aria-expanded={open} onClick={() => { onOpenChange(!open); setCopyStatus('') }} className="min-h-11 text-sm font-semibold">{open ? 'Close phone option' : 'Continue on phone'}</button>
    {open && <div className="space-y-4 pt-2">
      <p className="text-sm leading-6 text-gray-500">Scan with your phone camera and sign in with the same account. Continue verification in your browser—no app needed.</p>
      <div className="mx-auto w-fit rounded-xl bg-white p-3"><QRCodeSVG value={link} size={192} marginSize={4} title="Open verification on your phone" /></div>
      <p className="text-xs leading-5 text-gray-500">Completed checks are saved. You may need to re-enter unfinished details or retake a photo. This page checks for your result while open.</p>
      <label className="block text-xs text-gray-500">Verification link<input aria-label="Verification link" readOnly value={link} onFocus={event => event.target.select()} className="mt-2 block w-full rounded-xl border border-gray-200 bg-transparent p-3 text-xs dark:border-white/15" /></label>
      <button type="button" className="min-h-11 text-sm font-semibold" onClick={async () => {
        try { await navigator.clipboard.writeText(link); setCopyStatus('Link copied') }
        catch { setCopyStatus('Select and copy the link above.') }
      }}>Copy link</button>
      {copyStatus && <p role="status" className="text-xs text-gray-500">{copyStatus}</p>}
    </div>}
  </div>
}
