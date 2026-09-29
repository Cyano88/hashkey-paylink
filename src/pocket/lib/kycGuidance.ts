type State = { status: string; canResume?: boolean; canCorrectNames?: boolean; failureReason?: string | null }
export function kycGuidance(state: State) {
  if (state.canResume) return { title: 'Finish verification', message: 'Your last session was not submitted. Continue to finish your verification.', action: 'resume' as const }
  if (state.status === 'pending') return { title: 'Verification submitted', message: 'Your submission was received. We are waiting for the verification result. You can leave this screen.', action: 'wait' as const }
  if (state.status === 'review' && state.canCorrectNames && state.failureReason === 'submitted_name_mismatch') return { title: 'Check your names', message: 'The names you entered did not match your BVN record. Enter your first and middle names under Given names, and your surname under Last name. A new verification is required.', action: 'correct' as const }
  if (state.status === 'review') {
    const message = state.failureReason === 'identity_mismatch'
      ? 'Your additional ID details did not match your verified BVN. Contact support to check the mismatch before trying again.'
      : state.failureReason === 'provider_fraud_review'
      ? 'Your identity check completed, but an additional check needs review. Contact support for the next step. You do not need to submit again.'
      : ['identity_name_missing', 'identity_birth_date_missing_or_invalid', 'document_type_mismatch'].includes(state.failureReason || '')
      ? 'We could not confirm all the required identity details from the result. Contact support. You do not need to submit again.'
      : 'Your verification needs review. Contact support for the next step. You do not need to submit again.'
    return { title: 'Verification needs attention', message, action: 'support' as const }
  }
  if (state.status === 'failed') {
    if (state.failureReason === 'session_failed') return { title: 'Verification did not start', message: 'The verification session could not start. Please try again.', action: 'retry' as const }
    if (state.failureReason === 'provider_error') return { title: 'Verification unavailable', message: 'The verification service could not complete this check. Please try again later.', action: 'retry' as const }
    if (state.failureReason === 'face_mismatch') return { title: 'Selfie did not match', message: 'Your selfie could not be matched to your ID photo. Contact support before submitting again.', action: 'support' as const }
    return { title: 'Verification did not pass', message: 'We could not verify your identity. Contact support to find out what needs to change before trying again.', action: 'support' as const }
  }
  return null
}
