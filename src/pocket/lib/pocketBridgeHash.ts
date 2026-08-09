function hashString(value: string) {
  const normalized = value.trim()
  if (/^0x[a-fA-F0-9]{64}$/.test(normalized) || /^[1-9A-HJ-NP-Za-km-z]{64,96}$/.test(normalized)) return normalized
  try {
    const url = new URL(normalized)
    for (const part of url.pathname.split('/').reverse()) {
      if (/^0x[a-fA-F0-9]{64}$/.test(part) || /^[1-9A-HJ-NP-Za-km-z]{64,96}$/.test(part)) return part
    }
  } catch {
    // Non-URL strings are handled by the exact hash checks above.
  }
  return null
}

export function findPocketBridgeSourceHash(value: unknown): string | null {
  if (typeof value === 'string') return hashString(value)
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  for (const key of ['burnTxHash', 'txHash', 'transactionHash', 'signature']) {
    const found = findPocketBridgeSourceHash(record[key])
    if (found) return found
  }
  for (const nested of Object.values(record)) {
    const found = findPocketBridgeSourceHash(nested)
    if (found) return found
  }
  return null
}
