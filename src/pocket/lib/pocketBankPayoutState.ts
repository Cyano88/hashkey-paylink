const ACTIVE_BANK_PAYOUT_KEY = 'pocket:bank-withdraw:active'
const ACTIVE_BANK_PAYOUT_TTL_MS = 24 * 60 * 60_000

export function readActivePocketBankPayout() {
  try {
    const value = JSON.parse(window.localStorage.getItem(ACTIVE_BANK_PAYOUT_KEY) || 'null') as { intentId?: string; savedAt?: number } | null
    if (!value?.intentId || !value.savedAt || Date.now() - value.savedAt >= ACTIVE_BANK_PAYOUT_TTL_MS) {
      window.localStorage.removeItem(ACTIVE_BANK_PAYOUT_KEY)
      return ''
    }
    return value.intentId
  } catch {
    window.localStorage.removeItem(ACTIVE_BANK_PAYOUT_KEY)
    return ''
  }
}

export function saveActivePocketBankPayout(intentId: string) {
  window.localStorage.setItem(ACTIVE_BANK_PAYOUT_KEY, JSON.stringify({ intentId, savedAt: Date.now() }))
}

export function clearActivePocketBankPayout(intentId?: string) {
  if (!intentId || readActivePocketBankPayout() === intentId) window.localStorage.removeItem(ACTIVE_BANK_PAYOUT_KEY)
}
