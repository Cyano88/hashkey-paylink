// Display-only rounding. Never use this value to build a transaction or a Max amount.
export function formatStockQuantity(value: string | number) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return new Intl.NumberFormat('en-US', { maximumSignificantDigits: 6 }).format(number)
}
