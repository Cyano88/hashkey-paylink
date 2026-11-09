let approvalToken = ''
let approvalExpiresAt = 0
let approvalAuthorization = ''
let paymentPreparer: (() => Promise<void>) | null = null

export const POCKET_PAYMENT_APPROVAL_EVENT = 'pocket:payment-approval-request'
export const POCKET_PAYMENT_APPROVAL_DISMISSED_EVENT = 'pocket:payment-approval-dismissed'
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

export function requestPocketPaymentApproval(options: { expiresAt?: number; signal?: AbortSignal } = {}) {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const isActive = () => !settled && !options.signal?.aborted && (options.expiresAt === undefined || Date.now() < options.expiresAt)
    const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); document.removeEventListener('visibilitychange', check) }
    const dismiss = (error: Error) => {
      if (settled) return
      settled = true; cleanup()
      window.dispatchEvent(new CustomEvent(POCKET_PAYMENT_APPROVAL_DISMISSED_EVENT, { detail }))
      reject(error)
    }
    const check = () => { if (!isActive()) dismiss(new Error('Checkout expired. Start a new checkout.')) }
    const cancel = () => dismiss(new Error('Payment approval was cancelled.'))
    const detail = { isActive,
      resolve: () => { if (!isActive()) { check(); return }; settled = true; cleanup(); resolve() },
      reject: (reason?: unknown) => { if (settled) return; settled = true; cleanup(); reject(reason) },
    }
    if (!isActive()) { check(); return }
    if (options.expiresAt !== undefined) timer = setTimeout(check, Math.max(0, options.expiresAt - Date.now()))
    options.signal?.addEventListener('abort', cancel, { once: true })
    document.addEventListener('visibilitychange', check)
    window.dispatchEvent(new CustomEvent(POCKET_PAYMENT_APPROVAL_EVENT, { detail }))
  })
}
