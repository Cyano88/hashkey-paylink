let approvalToken = ''
let approvalExpiresAt = 0

export const POCKET_PAYMENT_APPROVAL_EVENT = 'pocket:payment-approval-request'

export function setPocketPaymentApproval(token: string, expiresAt: number) {
  approvalToken = token
  approvalExpiresAt = expiresAt
}

export function takePocketPaymentApproval() {
  if (!approvalToken || approvalExpiresAt <= Date.now()) {
    approvalToken = ''
    approvalExpiresAt = 0
    return ''
  }
  return approvalToken
}

export function requestPocketPaymentApproval() {
  return new Promise<void>((resolve, reject) => {
    window.dispatchEvent(new CustomEvent(POCKET_PAYMENT_APPROVAL_EVENT, { detail: { resolve, reject } }))
  })
}
