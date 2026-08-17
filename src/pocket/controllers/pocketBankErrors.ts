export function readablePocketBankPayoutError(reason: unknown, fallback: string) {
  const message = (reason instanceof Error && reason.message
    ? reason.message
    : typeof reason === 'string' && reason
      ? reason
      : fallback).split('Paycrest ').join('')
  if (/PAYCREST_API_KEY|not configured/i.test(message)) {
    return 'Bank payouts are temporarily unavailable. Please try again later.'
  }
  if (/^request failed\.?$|account (?:was not found|not found)|invalid (?:bank )?account|could not (?:resolve|verify) (?:the )?(?:bank )?account/i.test(message)) {
    return 'Wrong bank details. Recheck the selected bank and account number.'
  }
  return message
}
