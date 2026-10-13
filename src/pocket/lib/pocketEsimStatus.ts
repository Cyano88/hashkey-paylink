import type { PocketEsimOrder } from './pocketEsim'

export function pocketEsimStatus(state: PocketEsimOrder['state']) {
  switch (state) {
    case 'ready': return { state: 'successful' as const, label: 'eSIM ready', detail: 'Ready to install' }
    case 'refunded': return { state: 'reversed' as const, label: 'Refunded', detail: 'Returned to your Base wallet' }
    case 'payment_failed': return { state: 'failed' as const, label: 'Payment not sent', detail: 'No eSIM was purchased' }
    case 'refund_eligible': case 'refunding': return { state: 'pending' as const, label: 'Refund in progress', detail: 'Returning your payment' }
    case 'needs_review': return { state: 'pending' as const, label: 'Checking your order', detail: 'Your order is saved in My eSIMs' }
    case 'payment_received': case 'ordering': case 'order_unknown': case 'provisioning':
      return { state: 'pending' as const, label: 'Preparing eSIM', detail: 'Payment received' }
    case 'quoted': return { state: 'pending' as const, label: 'Review payment', detail: 'Payment not started' }
    default: return { state: 'pending' as const, label: 'Confirming payment', detail: 'Your order is saved in My eSIMs' }
  }
}
