/** UI wording only; provider codes and payment guards remain unchanged. */
export function pocketPricingMessage(message: string) {
  if (!/\bquotes?\b/i.test(message)) return message
  if (/expir|chang|mismatch|match|review/i.test(message)) return 'Review the updated amount before confirming.'
  return 'Could not update the amount. Try again.'
}
