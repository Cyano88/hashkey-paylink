export function checkoutMessage(message:string) {
  if(!message)return ''
  if(/cancelled|canceled|user rejected|user denied/i.test(message))return 'Cancelled. You can continue when ready.'
  if(/Circle wallet session|RecoveryRequired|session needs to be reconnected/i.test(message))return 'Confirm your email to continue.'
  if(/account changed|sign in again/i.test(message))return 'Your session ended. Sign in again to continue.'
  if(/wallet does not match|wallet linked|wallet identity/i.test(message))return 'This wallet does not match your account. Use the correct email.'
  if(/fetch|network error|timeout|timed out|HTTP 5\d\d/i.test(message))return 'Could not connect. Please try again.'
  if(/Circle|Privy|encryption|userToken|stack|HTTP|SDK/i.test(message))return 'Could not continue. Please try again.'
  return message
}
