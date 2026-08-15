const ACTIVE_BANK_PAYOUT_KEY = 'pocket:bank-withdraw:active'
const ACTIVE_BANK_PAYOUT_TTL_MS = 24 * 60 * 60_000

type ActiveBankPayout = { intentId: string; txHash: string; savedAt: number }

function readActiveState(): ActiveBankPayout | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(ACTIVE_BANK_PAYOUT_KEY) || 'null') as { intentId?: string; txHash?: string; savedAt?: number } | null
    if (!value?.intentId || !value.savedAt || Date.now() - value.savedAt >= ACTIVE_BANK_PAYOUT_TTL_MS) {
      window.localStorage.removeItem(ACTIVE_BANK_PAYOUT_KEY)
      return null
    }
    return { intentId: value.intentId, txHash: value.txHash || '', savedAt: value.savedAt }
  } catch {
    window.localStorage.removeItem(ACTIVE_BANK_PAYOUT_KEY)
    return null
  }
}

export function readActivePocketBankPayout() {
  return readActiveState()?.intentId || ''
}

export function readActivePocketBankPayoutTransfer(intentId: string) {
  const state = readActiveState()
  return state?.intentId === intentId ? state.txHash : ''
}

export function saveActivePocketBankPayout(intentId: string, txHash = '') {
  const current = readActiveState()
  window.localStorage.setItem(ACTIVE_BANK_PAYOUT_KEY, JSON.stringify({
    intentId,
    txHash: txHash || (current?.intentId === intentId ? current.txHash : ''),
    savedAt: Date.now(),
  }))
}

export function clearActivePocketBankPayout(intentId?: string) {
  if (!intentId || readActivePocketBankPayout() === intentId) window.localStorage.removeItem(ACTIVE_BANK_PAYOUT_KEY)
}
