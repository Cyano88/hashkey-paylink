import { useEffect, useState } from 'react'
import PocketBottomSheet from './PocketBottomSheet'
import { pocketTravelAlertsAvailable, pocketTravelAlertsEnabled, enablePocketTravelAlerts, disablePocketTravelAlerts, pocketTravelCountryChangeEventName } from '../lib/pocketTravelAlerts'
import { ChevronRight } from './PocketIcons'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'
import { useNavigate } from 'react-router-dom'

function countryName(code: string) {
  try { return new Intl.DisplayNames(undefined, { type: 'region' }).of(code) || code } catch { return code }
}

export default function PocketTravelAlertsControl() {
  const [open, setOpen] = useState(false), [enabled, setEnabled] = useState(false), [error, setError] = useState('')
  useEffect(() => setEnabled(pocketTravelAlertsEnabled()), [])
  if (!pocketTravelAlertsAvailable()) return null
  return <>
    <button type="button" onClick={() => { setError(''); setOpen(true) }} className="mt-5 flex min-h-14 w-full items-center justify-between border-y border-gray-100 py-3 text-left dark:border-[#262626]">
      <span><span className="block text-sm font-medium">Travel alerts</span><span className="mt-1 block text-xs text-gray-500">{enabled ? 'On' : 'Off'}</span></span><ChevronRight className="h-4 w-4 text-gray-400" />
    </button>
    {open && <PocketBottomSheet title="Travel alerts" onClose={() => setOpen(false)}>
      <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">Pocket checks your phone’s mobile network when you open the app or return to it. It saves only the last country on this device and does not collect precise location. Alerts may not appear without mobile service.</p>
      {error && <p role="alert" className="mb-4 mt-4 text-xs text-red-700/80 dark:text-red-300/90">{error}</p>}
      {enabled
        ? <button type="button" className="pocket-cta-primary mt-6 w-full" onClick={() => { disablePocketTravelAlerts(); setEnabled(false); setOpen(false) }}>Turn off travel alerts</button>
        : <button type="button" className="pocket-cta-primary mt-6 w-full" onClick={() => { setError(''); void enablePocketTravelAlerts().then(() => { setEnabled(true); setOpen(false) }).catch(reason => setError((reason as Error).message)) }}>Turn on travel alerts</button>}
    </PocketBottomSheet>}
  </>
}

export function PocketTravelArrivalNotice() {
  const navigate = useNavigate()
  const [countryCode, setCountryCode] = useState('')
  useEffect(() => {
    const eventName = pocketTravelCountryChangeEventName()
    const changed = (event: Event) => {
      const code = (event as CustomEvent<{ countryCode?: string }>).detail?.countryCode || ''
      if (/^[A-Z]{2}$/.test(code)) setCountryCode(code)
    }
    window.addEventListener(eventName, changed)
    return () => window.removeEventListener(eventName, changed)
  }, [])
  if (!countryCode) return null
  const name = countryName(countryCode)
  return <PocketBottomSheet title="New network country" onClose={() => setCountryCode('')}>
    <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">Pocket detected a mobile network in {name}. Check your saved eSIM before buying another plan.</p>
    <button type="button" className="pocket-cta-primary mt-6 w-full" onClick={() => { setCountryCode(''); navigate(`${POCKET_BASE_PATH}${POCKET_ROUTES.esim}?arrival=${encodeURIComponent(countryCode)}`) }}>Review eSIMs</button>
    <button type="button" className="mt-2 min-h-11 w-full text-sm font-medium text-gray-500" onClick={() => setCountryCode('')}>Not now</button>
  </PocketBottomSheet>
}
