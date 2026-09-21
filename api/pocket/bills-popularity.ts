import type { PocketBillsIntent } from './bills-store.js'

// Only successful live purchases count. No customer information leaves this aggregation.
export function rankPocketDataPlans(intents: Iterable<PocketBillsIntent>, now: number): Record<string, string[]> {
  const counts = new Map<string, Map<string, number>>()
  const cutoff = now - 30 * 24 * 60 * 60 * 1000
  for (const intent of intents) {
    if (intent.category !== 'data' || intent.state !== 'delivered' || intent.providerEnvironment !== 'live'
      || !intent.variationCode || !Number.isFinite(intent.createdAt) || intent.createdAt < cutoff || intent.createdAt > now) continue
    const service = intent.serviceId.toLowerCase()
    const plans = counts.get(service) ?? new Map<string, number>()
    plans.set(intent.variationCode, (plans.get(intent.variationCode) ?? 0) + 1)
    counts.set(service, plans)
  }
  return Object.fromEntries([...counts].map(([service, plans]) => [service, [...plans].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([code]) => code)]))
}
