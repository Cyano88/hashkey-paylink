export function readablePocketBankPayoutError(reason: unknown, fallback: string) {
  const message = (reason instanceof Error && reason.message
    ? reason.message
    : typeof reason === 'string' && reason
      ? reason
      : fallback).split('Paycrest ').join('')
  if (/PAYCREST_API_KEY|not configured/i.test(message)) {
    return 'Bank payouts are temporarily unavailable. Please try again later.'
  }
  if (/account (?:was not found|not found)|invalid (?:bank )?account/i.test(message)) {
    return 'Wrong bank details. Recheck the selected bank and account number.'
  }
  if (/^request failed\.?$|could not (?:resolve|verify) (?:the )?(?:bank )?account/i.test(message)) {
    return 'Account lookup could not be completed. Try again.'
  }
  return message
}
