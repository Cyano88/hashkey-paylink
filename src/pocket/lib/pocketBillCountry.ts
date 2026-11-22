export type PocketBillCountry = 'NG' | 'UG' | 'KE'
export type InternationalBillCountry = Exclude<PocketBillCountry, 'NG'>
export type InternationalBillCurrency = 'UGX' | 'KES'
export const BILL_COUNTRIES = [{ value: 'NG', label: 'Nigeria' }, { value: 'UG', label: 'Uganda' }, { value: 'KE', label: 'Kenya' }] as const
export function isInternationalBillCountry(value: PocketBillCountry): value is InternationalBillCountry { return value !== 'NG' }
export function billLocalCurrency(value: PocketBillCountry): 'NGN' | InternationalBillCurrency { return value === 'UG' ? 'UGX' : value === 'KE' ? 'KES' : 'NGN' }
export function normalizeUgandaPhone(value: string) {
  const digits = value.replace(/[\s()+-]/g, '')
  const national = digits.startsWith('256') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits
  return /^7\d{8}$/.test(national) ? `256${national}` : ''
}
export function normalizeKenyaPhone(value: string) {
  const digits = value.replace(/[\s()+-]/g, '')
  const national = digits.startsWith('254') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits
  return /^[17]\d{8}$/.test(national) ? `254${national}` : ''
}
export function normalizeInternationalBillPhone(country: InternationalBillCountry, value: string) {
  return country === 'KE' ? normalizeKenyaPhone(value) : normalizeUgandaPhone(value)
}
export function billDestination(value: unknown): PocketBillCountry {
  if (value === undefined || value === 'NG') return 'NG'
  if (value === 'UG') return 'UG'
  if (value === 'KE') return 'KE'
  throw Object.assign(new Error('Choose a supported bill destination.'),{status:400})
}
