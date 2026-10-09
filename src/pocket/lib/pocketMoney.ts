/** Two decimal places for stablecoin display only; never use this to construct transactions. */
export function formatPocketDisplayAmount(value: string | number) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '0.00'
  if (amount !== 0 && Math.abs(amount) < 0.01) return amount < 0 ? '-<0.01' : '<0.01'
  return amount.toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2})
}

/** Premium dollar balance formatting: leading symbol is rendered by the caller. */
export function formatPocketDollarAmount(value: string | number) {
  return formatPocketDisplayAmount(value)
}

/** Format the visible quote only; its original exact debit remains unchanged. */
export function formatPocketPaymentAmount(value: string | number) {
  const amount = Number(value)
  return Number.isFinite(amount) ? formatPocketDisplayAmount(amount) : ''
}
