let approvalToken = ''
let approvalExpiresAt = 0
let approvalAuthorization = ''
let paymentPreparer: (() => Promise<void>) | null = null

export const POCKET_PAYMENT_APPROVAL_EVENT = 'pocket:payment-approval-request'
export const POCKET_PAYMENT_APPROVAL_CANCELLED_EVENT = 'pocket:payment-approval-cancelled'

export function setPocketPaymentApproval(token: string, expiresAt: number, authorization: string) {
  approvalToken = token
  approvalExpiresAt = expiresAt
  approvalAuthorization = authorization
}

export function takePocketPaymentApproval() {
  if (!approvalToken || !approvalAuthorization || approvalExpiresAt <= Date.now()) {
    approvalToken = ''
    approvalExpiresAt = 0
    approvalAuthorization = ''
    return null
  }
  const approval = { token: approvalToken, authorization: approvalAuthorization }
  approvalToken = ''
  approvalExpiresAt = 0
  approvalAuthorization = ''
  return approval
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
