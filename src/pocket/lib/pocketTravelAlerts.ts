import { Capacitor, registerPlugin } from '@capacitor/core'

const enabledKey = 'pocket:travel-alerts:enabled'
const countryKey = 'pocket:travel-alerts:last-country'
const eventName = 'pocket-travel-country-change'
const native = registerPlugin<{ currentCountry(): Promise<{ countryCode: string }> }>('PocketTravelCountry')

export function pocketTravelAlertsAvailable() {
  return Capacitor.getPlatform() === 'android'
}

export function pocketTravelAlertsEnabled() {
  try { return localStorage.getItem(enabledKey) === 'true' } catch { return false }
}

export async function enablePocketTravelAlerts() {
  if (!pocketTravelAlertsAvailable()) throw new Error('Travel alerts are not available on this device.')
  let countryCode = ''
  try { countryCode = (await native.currentCountry()).countryCode.toUpperCase() } catch { /* No mobile-network country yet. */ }
  try {
    localStorage.setItem(enabledKey, 'true')
    if (/^[A-Z]{2}$/.test(countryCode)) localStorage.setItem(countryKey, countryCode)
    else localStorage.removeItem(countryKey)
  } catch { throw new Error('Travel alerts could not be saved on this device.') }
  return Boolean(countryCode)
}

export function disablePocketTravelAlerts() {
  try { localStorage.setItem(enabledKey, 'false') } catch { /* Treat storage failure as disabled below. */ }
}

export async function checkPocketTravelCountry() {
  if (!pocketTravelAlertsAvailable() || !pocketTravelAlertsEnabled()) return
  const result = await native.currentCountry()
  const next = String(result?.countryCode || '').toUpperCase()
  if (!/^[A-Z]{2}$/.test(next)) return
  let previous = ''
  try { previous = (localStorage.getItem(countryKey) || '').toUpperCase() } catch { return }
  try { localStorage.setItem(countryKey, next) } catch { return }
  if (!previous || previous === next) return
  window.dispatchEvent(new CustomEvent(eventName, { detail: { countryCode: next } }))
}

export function pocketTravelCountryChangeEventName() { return eventName }
