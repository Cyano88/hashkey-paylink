let approvalToken = ''
let approvalExpiresAt = 0
let paymentPreparer: (() => Promise<void>) | null = null

export const POCKET_PAYMENT_APPROVAL_EVENT = 'pocket:payment-approval-request'
export const POCKET_PAYMENT_APPROVAL_CANCELLED_EVENT = 'pocket:payment-approval-cancelled'

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

export function registerPocketPaymentPreparer(preparer: () => Promise<void>) {
  paymentPreparer = preparer
  return () => {
    if (paymentPreparer === preparer) paymentPreparer = null
  }
}

export async function preparePocketPaymentApproval() {
  await paymentPreparer?.()
}

export function requestPocketPaymentApproval() {
  return new Promise<void>((resolve, reject) => {
    window.dispatchEvent(new CustomEvent(POCKET_PAYMENT_APPROVAL_EVENT, { detail: { resolve, reject } }))
  })
}
