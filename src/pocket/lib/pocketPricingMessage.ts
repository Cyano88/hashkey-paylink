export function isPocketConnectionError(message: string) {
  return /connection (?:closed|reset|refused)|failed to fetch|fetch failed|network ?(?:error|request failed)|load failed|econnreset|econnrefused|socket hang up|timed? ?out|timeout|aborted/i.test(message)
}

/** UI wording only; provider codes and payment guards remain unchanged. */
export function pocketPricingMessage(message: string) {
  if (isPocketConnectionError(message)) return 'Could not reach the service. Try again.'
  if (!/\bquotes?\b/i.test(message)) return message
  if (/expir|chang|mismatch|match|review/i.test(message)) return 'Review the updated amount before confirming.'
  return 'Could not update the amount. Try again.'
}
