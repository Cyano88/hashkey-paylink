export type XPayStepState = 'waiting' | 'submitted' | 'confirmed' | 'failed'
export type XPayProgressSnapshot = {
  // Omit stages that this payment does not need. Confirmed means verified
  // swap output, destination USDC arrival, or the payment's settlement proof.
  swap?: XPayStepState
  bridge?: XPayStepState
  payment: XPayStepState
}
export function xpayProgressSteps(snapshot: XPayProgressSnapshot) {
  const steps = [
    ...(snapshot.swap ? [{ id: 'swap', label: 'Swapping', state: snapshot.swap }] : []),
    ...(snapshot.bridge ? [{ id: 'bridge', label: 'Bridging', state: snapshot.bridge }] : []),
    { id: 'payment', label: 'Confirming payment', state: snapshot.payment },
  ]
  const current = steps.findIndex(step => step.state !== 'confirmed')
  return steps.map((step, index) => ({ ...step,
    // A later proof cannot paint an unfinished earlier stage as completed.
    done: step.state === 'confirmed' && (current < 0 || index < current),
    active: index === current && step.state === 'submitted',
    failed: index === current && step.state === 'failed',
  }))
}

export type XPayRecovery = {
  stage: 'swap' | 'bridge'
  reason: 'insufficient_okb' | 'quote_expired' | 'provider_unavailable' | 'transaction_reverted' | 'unknown'
  outcome: 'not_submitted' | 'reverted' | 'unknown'
  // For bridge failures, the burn state decides whether to retry burning or
  // resume minting on Base. A missing/uncertain burn state never permits retry.
  burn?: 'not_submitted' | 'submitted' | 'confirmed' | 'reverted'
}
export type XPayRetryAction = 'swap' | 'bridge_burn' | 'bridge_mint'
export function xpayRecoveryView(progress: XPayProgressSnapshot, recovery: XPayRecovery): { reason: string; action?: XPayRetryAction } {
  const failed = xpayProgressSteps(progress).find(step => step.failed)
  let action: XPayRetryAction | undefined
  if (failed?.id === recovery.stage && recovery.outcome !== 'unknown') {
    if (recovery.stage === 'swap') action = 'swap'
    else if (recovery.burn === 'confirmed') action = 'bridge_mint'
    else if (recovery.burn === 'not_submitted' || recovery.burn === 'reverted') action = 'bridge_burn'
  }
  if (!action) return { reason: 'Checking transaction status. Please do not pay again.' }
  const reason = recovery.reason === 'insufficient_okb' && action !== 'bridge_mint'
    ? 'Not enough OKB for the network fee. Add OKB in Pocket, then retry.'
    : recovery.reason === 'quote_expired'
      ? 'The quote expired. Retry to review an updated amount.'
      : recovery.reason === 'provider_unavailable'
        ? 'The service is temporarily unavailable. Please retry.'
        : recovery.reason === 'transaction_reverted'
          ? 'This step did not complete. Retry to continue your payment.'
          : 'This step could not complete. Please retry.'
  return { reason, action }
}
