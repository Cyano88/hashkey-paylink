import type { Hex } from 'viem'

export type GiftClaimPhase = 'ready' | 'preparing' | 'approval' | 'checking' | 'unconfirmed' | 'confirmed' | 'unavailable'
export type GiftClaimProgress = { phase: GiftClaimPhase; message: string; transactionHash?: Hex }
export type GiftClaimResult = { status: 'creator' | 'confirmed' | 'claimed_elsewhere' | 'confirming' | 'funding' | 'available' | 'expired' | 'refunded'; transactionHash?: Hex; retryAllowed?: boolean }

/** One controller per gift and authenticated identity. Never automatically repeats approval. */
export function createGiftClaimFlow<Approval>(deps: {
  prepare(): Promise<Approval>
  approve(approval: Approval): Promise<{ transactionHash: string | null }>
  status(hash?: Hex): Promise<GiftClaimResult>
  changed(progress: GiftClaimProgress): void
}) {
  let active = true, running = false, approvalInterrupted = false
  let state: GiftClaimProgress = { phase: 'ready', message: '' }
  const publish = (next: GiftClaimProgress) => { if (active) { state = next; deps.changed(next) } }
  async function check(quiet = false) {
    if (!active) return
    if (!quiet) publish({ ...state, phase: 'checking', message: 'Checking your claim.' })
    try {
      const result = await deps.status(state.transactionHash)
      if (result.status === 'confirmed' && /^0x[0-9a-fA-F]{64}$/.test(result.transactionHash || '')) {
        publish({ phase: 'confirmed', message: 'Gift claimed', transactionHash: result.transactionHash })
      } else if (['creator', 'claimed_elsewhere', 'expired', 'refunded'].includes(result.status)) {
        publish({ phase: 'unavailable', message: result.status === 'creator' ? 'You cannot claim your own gift.' : result.status === 'claimed_elsewhere' ? 'This gift has already been claimed.' : result.status === 'expired' ? 'This gift has expired.' : 'This gift was returned to its sender.' })
      } else if (result.status === 'available' && result.retryAllowed === true) {
        publish({ phase: 'ready', message: approvalInterrupted ? 'Your previous approval expired. You can claim again.' : '' })
      } else {
        publish({ ...state, phase: 'unconfirmed', message: approvalInterrupted ? 'Wallet approval did not finish. Checking your gift automatically.' : 'Confirmation pending. This updates automatically.' })
      }
    } catch {
      publish({ ...state, phase: 'unconfirmed', message: 'Reconnecting to confirm your gift automatically.' })
    }
  }
  return {
    get state() { return state },
    async claim() {
      if (!active || running || state.phase !== 'ready') return
      running = true
      publish({ phase: 'preparing', message: 'Preparing your claim.' })
      approvalInterrupted = false
      let approvalStarted = false
      try {
        const approval = await deps.prepare()
        if (!active) return
        publish({ phase: 'approval', message: 'Confirm in your wallet.' })
        approvalStarted = true
        const result = await deps.approve(approval)
        if (!active) return
        const hash = /^0x[0-9a-fA-F]{64}$/.test(result.transactionHash || '') ? result.transactionHash as Hex : undefined
        publish({ phase: 'checking', message: 'Checking your claim.', transactionHash: hash })
        await check()
      } catch {
        if (approvalStarted) { approvalInterrupted = true; await check() }
        else publish({ phase: 'ready', message: 'Could not prepare your claim. Please try again.' })
      } finally { running = false }
    },
    async refresh() {
      if (!active || running || state.phase !== 'unconfirmed') return
      running = true
      try { await check(true) } finally { running = false }
    },
    async recheck() {
      if (!active || running || state.phase === 'confirmed' || state.phase === 'unavailable') return
      running = true
      try { await check() } finally { running = false }
    },
    dispose() { active = false },
  }
}
