// Shared FX currency list + helpers used by CreateLink, PaymentPage, EventDashboard

export const FX_CURRENCIES = [
  { code: 'NGN', symbol: '₦',   name: 'Nigerian Naira',    decimals: 0 },
  { code: 'GHS', symbol: '₵',   name: 'Ghanaian Cedi',     decimals: 2 },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling',   decimals: 2 },
  { code: 'SGD', symbol: 'S$',  name: 'Singapore Dollar',  decimals: 2 },
] as const

export type FxCode = typeof FX_CURRENCIES[number]['code']

export function getFxMeta(code: string) {
  return FX_CURRENCIES.find(c => c.code === code) ?? null
}

export function formatLocalAmt(usdc: number, rate: number, decimals: number): string {
  const local = usdc * rate
  return local.toLocaleString('en', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  })
}

export type FxRateResponse = {
  ok:       boolean
  rate?:    number
  currency?: string
  symbol?:  string
  name?:    string
  decimals?: number
  cachedAt?: number
  stale?:   boolean
  error?:   string
}

export async function fetchFxRate(currency: string): Promise<FxRateResponse> {
  const res  = await fetch(`/api/fx-rate?currency=${encodeURIComponent(currency)}`)
  return res.json() as Promise<FxRateResponse>
}
