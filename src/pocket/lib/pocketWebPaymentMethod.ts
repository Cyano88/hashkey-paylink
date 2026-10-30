export type WebPaymentMethod = 'wallet' | 'card' | 'bank_transfer'
export function webPaymentMethod(value?: WebPaymentMethod): WebPaymentMethod { return value || 'wallet' }
export function webPaymentMethodLabel(value?: WebPaymentMethod) { return value === 'card' ? 'Card payment' : value === 'bank_transfer' ? 'Bank transfer' : 'Wallet payment' }
