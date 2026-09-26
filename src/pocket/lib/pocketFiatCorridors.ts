export type PocketFiatCurrency = 'NGN' | 'UGX'
export type PocketFiatCountry = 'NG' | 'UG'
export const pocketFiatCurrency = (country: unknown): PocketFiatCurrency => country === 'UG' ? 'UGX' : 'NGN'
export function normalizePayoutAccount(value: unknown, currency: PocketFiatCurrency = 'NGN') {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (currency === 'NGN') return /^\d{10}$/.test(digits) ? digits : ''
  const international = digits.startsWith('0') ? '256' + digits.slice(1) : digits.length === 9 ? '256' + digits : digits
  return /^256[37]\d{8}$/.test(international) ? international : ''
}
export function validPayoutCurrency(value: unknown): value is PocketFiatCurrency { return value === 'NGN' || value === 'UGX' }
