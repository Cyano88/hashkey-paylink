export type HostedCheckoutKind = 'usdc_request' | 'pos' | 'bank_request' | 'wallet_funding' | 'service'

export type HostedCheckoutPresentation = {
  kind: HostedCheckoutKind
  title: string
  action: string
  pending: string
  submitted: string
  successful: string
  steps: readonly [string, string, string]
}

const PRESENTATIONS: Record<HostedCheckoutKind, HostedCheckoutPresentation> = {
  usdc_request: {
    kind: 'usdc_request',
    title: 'Payment request',
    action: 'Slide to pay',
    pending: 'Confirm in wallet',
    submitted: 'Confirming on-chain',
    successful: 'Payment successful',
    steps: ['Check request', 'Slide to pay', 'Get confirmation'],
  },
  pos: {
    kind: 'pos',
    title: 'Merchant checkout',
    action: 'Slide to pay',
    pending: 'Confirm in wallet',
    submitted: 'Confirming payment',
    successful: 'Payment successful',
    steps: ['Check merchant', 'Slide to pay', 'Get confirmation'],
  },
  bank_request: {
    kind: 'bank_request',
    title: 'Bank payment request',
    action: 'Slide to pay',
    pending: 'Confirm in wallet',
    submitted: 'Confirming payment',
    successful: 'Payment successful',
    steps: ['Check request', 'Slide to pay', 'Track delivery'],
  },
  wallet_funding: {
    kind: 'wallet_funding',
    title: 'Wallet funding',
    action: 'Slide to fund',
    pending: 'Confirm in wallet',
    submitted: 'Confirming on-chain',
    successful: 'Funded',
    steps: ['Check wallet', 'Slide to fund', 'Return to app'],
  },
  service: {
    kind: 'service',
    title: 'Service checkout',
    action: 'Slide to pay',
    pending: 'Confirm in wallet',
    submitted: 'Confirming payment',
    successful: 'Payment successful',
    steps: ['Check service', 'Slide to pay', 'Return to service'],
  },
}

export function resolveHostedCheckoutKind(params: URLSearchParams): HostedCheckoutKind {
  const hostedKind = (params.get('hostedKind') ?? '').trim().toLowerCase()
  if (hostedKind in PRESENTATIONS) return hostedKind as HostedCheckoutKind
  const source = (params.get('src') ?? '').trim().toLowerCase()
  if (source === 'ngpos') return 'pos'
  if (source === 'bank-receive') return 'bank_request'
  if (source === 'service' || source === 'telegram-helper') return 'service'
  if (source === 'agent' || params.get('brand') === 'polymarket' || params.get('pm') === '1') return 'wallet_funding'
  return 'usdc_request'
}

export function hostedCheckoutPresentation(kind: HostedCheckoutKind) {
  return PRESENTATIONS[kind]
}
