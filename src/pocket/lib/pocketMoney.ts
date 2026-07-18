function compactParts(value: string | number) {
  const numeric = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(numeric)) return null
  const absolute = Math.abs(numeric)
  const decimals = absolute >= 0.1 ? 2 : absolute >= 0.01 ? 3 : absolute >= 0.001 ? 4 : 6
  const scale = 10 ** decimals
  return { decimals, numeric: Math.trunc((numeric + Number.EPSILON) * scale) / scale }
}

/** Compact token precision for display only. Raw balances and transaction values stay unchanged. */
export function formatPocketDisplayAmount(value: string | number) {
  const compact = compactParts(value)
  if (!compact || compact.numeric === 0) return '0'
  return compact.numeric.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: compact.decimals,
  })
}

/** Premium dollar balance formatting: leading symbol is rendered by the caller. */
export function formatPocketDollarAmount(value: string | number) {
  const compact = compactParts(value)
  if (!compact || compact.numeric === 0) return '0.00'
  return compact.numeric.toLocaleString('en-US', {
    minimumFractionDigits: compact.decimals,
    maximumFractionDigits: compact.decimals,
  })
}
