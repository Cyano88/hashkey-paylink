export function readablePocketBankPayoutError(reason: unknown, fallback: string) {
  const message = (reason instanceof Error && reason.message
    ? reason.message
    : typeof reason === 'string' && reason
      ? reason
      : fallback).split('Paycrest ').join('')
  if (/PAYCREST_API_KEY|not configured/i.test(message)) {
    return 'Bank payouts are temporarily unavailable. Please try again later.'
  }
  return message
}
