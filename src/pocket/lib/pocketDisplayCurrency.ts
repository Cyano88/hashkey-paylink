export type PocketDisplayCurrency = 'USDC' | 'NGN' | 'UGX'
export const normalizePocketDisplayCurrency = (value: unknown): PocketDisplayCurrency => value === 'NGN' || value === 'UGX' ? value : 'USDC'
const listeners = new Set<() => void>()
export function readPocketDisplayCurrency(email: string): PocketDisplayCurrency {
  try { return normalizePocketDisplayCurrency(localStorage.getItem('pocket.stablecoins.currency:' + email.toLowerCase())) } catch { return 'USDC' }
}
export function publishPocketDisplayCurrency(email: string, value: unknown) {
  try { localStorage.setItem('pocket.stablecoins.currency:' + email.toLowerCase(), normalizePocketDisplayCurrency(value)) } catch {}
  listeners.forEach(listener => listener())
}
export function subscribePocketDisplayCurrency(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function localCurrencyAmount(value: number, currency: 'NGN' | 'UGX') {
  return (currency === 'NGN' ? '\u20a6' : 'USh ') + value.toLocaleString(currency === 'NGN' ? 'en-NG' : 'en-UG', { maximumFractionDigits: 2 })
}
