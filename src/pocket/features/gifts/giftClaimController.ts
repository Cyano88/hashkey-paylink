import type { Hex } from 'viem'

export type GiftClaimPhase = 'ready' | 'preparing' | 'approval' | 'checking' | 'unconfirmed' | 'confirmed' | 'unavailable'
export type GiftClaimProgress = { phase: GiftClaimPhase; message: string; transactionHash?: Hex }
export type GiftClaimResult = { status: 'confirmed' | 'claimed_elsewhere' | 'confirming' | 'funding' | 'available' | 'expired' | 'refunded'; transactionHash?: Hex }

/** One controller per gift and authenticated identity. Never automatically repeats approval. */
export function createGiftClaimFlow<Approval>(deps: {
  prepare(): Promise<Approval>
  approve(approval: Approval): Promise<{ transactionHash: string | null }>
  status(hash?: Hex): Promise<GiftClaimResult>
  changed(progress: GiftClaimProgress): void
}) {
  let active = true, running = false
  let state: GiftClaimProgress = { phase: 'ready', message: '' }
  const publish = (next: GiftClaimProgress) => { if (active) { state = next; deps.changed(next) } }
  async function check() {
    if (!active) return
    publish({ ...state, phase: 'checking', message: 'Checking your claim.' })
    try {
      const result = await deps.status(state.transactionHash)
      if (result.status === 'confirmed' && /^0x[0-9a-fA-F]{64}$/.test(result.transactionHash || '')) {
        publish({ phase: 'confirmed', message: 'Gift claimed', transactionHash: result.transactionHash })
      } else if (['claimed_elsewhere', 'expired', 'refunded'].includes(result.status)) {
        publish({ phase: 'unavailable', message: result.status === 'claimed_elsewhere' ? 'This gift has already been claimed.' : result.status === 'expired' ? 'This gift has expired.' : 'This gift was returned to its sender.' })
      } else {
        publish({ ...state, phase: 'unconfirmed', message: 'Your claim is not confirmed yet. Check its status before continuing.' })
      }
    } catch {
      publish({ ...state, phase: 'unconfirmed', message: 'We could not confirm your claim. Check again shortly.' })
    }
  }
  return {
    get state() { return state },
    async claim() {
      if (!active || running || state.phase !== 'ready') return
      running = true
      publish({ phase: 'preparing', message: 'Preparing your claim.' })
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
        if (approvalStarted) await check()
        else publish({ phase: 'ready', message: 'Could not prepare your claim. Please try again.' })
      } finally { running = false }
    },
    async recheck() {
      if (!active || running || state.phase === 'confirmed' || state.phase === 'unavailable') return
      running = true
      try { await check() } finally { running = false }
    },
    dispose() { active = false },
  }
}
