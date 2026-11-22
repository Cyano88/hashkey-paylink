export type PocketDisplayCurrency = 'USDC' | 'NGN' | 'UGX'
export const normalizePocketDisplayCurrency = (value: unknown): PocketDisplayCurrency => value === 'NGN' || value === 'UGX' ? value : 'USDC'
const listeners = new Set<() => void>()
export function readPocketDisplayCurrency(email: string): PocketDisplayCurrency {
  try { return normalizePocketDisplayCurrency(localStorage.getItem('pocket.stablecoins.currencyPreference:' + email.trim().toLowerCase()) ?? localStorage.getItem('pocket.xstocks.displayCurrency:' + email.trim().toLowerCase()) ?? localStorage.getItem('pocket.stablecoins.currency:' + email.trim().toLowerCase())) } catch { return 'USDC' }
}
// Explicit device preferences take priority over cached server profile defaults.
export function savePocketDisplayCurrency(email: string, value: PocketDisplayCurrency) {
  localStorage.setItem('pocket.stablecoins.currencyPreference:' + email.trim().toLowerCase(), value)
  listeners.forEach(listener => listener())
}
export function publishPocketDisplayCurrency(email: string, value: unknown) {
  try { localStorage.setItem('pocket.stablecoins.currency:' + email.trim().toLowerCase(), normalizePocketDisplayCurrency(value)) } catch {}
  listeners.forEach(listener => listener())
}
export function subscribePocketDisplayCurrency(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function formatPocketFiatAmount(value: number, currency: 'USD' | 'NGN' | 'UGX' | 'KES') {
  return currency + ' ' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
export function localCurrencyAmount(value: number, currency: 'NGN' | 'UGX' | 'KES') {
  return formatPocketFiatAmount(value, currency)
}
