/** Presentation can only advance after the proof required by the selected rail. */
export function checkoutCompletion(input: {
  transferConfirmed: boolean
  checkoutVerified?: boolean
  payoutSettled?: boolean
  fundingComplete?: boolean
  reverted?: boolean
}): 'pending' | 'successful' | 'failed' {
  if (input.reverted) return 'failed'
  return input.transferConfirmed && input.checkoutVerified !== false && input.payoutSettled !== false && input.fundingComplete !== false
    ? 'successful' : 'pending'
}
