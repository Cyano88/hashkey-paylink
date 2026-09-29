export type PocketBillCountry = 'NG' | 'UG'
export const BILL_COUNTRIES = [{ value: 'NG', label: 'Nigeria' }, { value: 'UG', label: 'Uganda' }] as const
export function normalizeUgandaPhone(value: string) {
  const digits = value.replace(/[\s()+-]/g, '')
  const national = digits.startsWith('256') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits
  return /^7\d{8}$/.test(national) ? `256${national}` : ''
}
export function billDestination(value: unknown): PocketBillCountry {
  if (value === undefined || value === 'NG') return 'NG'
  if (value === 'UG') return 'UG'
  throw Object.assign(new Error('Choose a supported bill destination.'),{status:400})
}
