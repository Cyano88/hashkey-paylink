const MIN_TIMEOUT_MS = 60_000

export const DEFAULT_PAYMENT_APPROVAL_TIMEOUT_MS = 5 * 60_000
export const DEFAULT_SUBMITTED_REVIEW_THRESHOLD_MS = 15 * 60_000

function configuredTimeout(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(MIN_TIMEOUT_MS, parsed) : fallback
}

export function paymentApprovalTimeoutMs() {
  return configuredTimeout(process.env.POCKET_PAYMENT_APPROVAL_TIMEOUT_MS, DEFAULT_PAYMENT_APPROVAL_TIMEOUT_MS)
}

export function submittedReviewThresholdMs() {
  return configuredTimeout(process.env.POCKET_MAX_UNRESOLVED_AGE_MS, DEFAULT_SUBMITTED_REVIEW_THRESHOLD_MS)
}

export function unsignedApprovalExpired(input: { updatedAt: number; transactionHash?: string; now: number; timeoutMs?: number }) {
  if (String(input.transactionHash ?? '').trim()) return false
  const timeoutMs = configuredTimeout(input.timeoutMs, paymentApprovalTimeoutMs())
  return Number.isFinite(input.updatedAt) && input.now - input.updatedAt >= timeoutMs
}
