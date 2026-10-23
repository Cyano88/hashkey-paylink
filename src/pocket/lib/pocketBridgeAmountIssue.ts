/** Only classify explicit amount constraints, never absence of a quote or generic 422s. */
export function pocketBridgeAmountIssue(message?: string): string | null {
  if (!message) return null
  if (message === 'Amount too small.') return message
  const minimum = message.match(/^Minimum(?: bridge)?(?: amount)?(?: is)? (\d+(?:\.\d+)?) (USDC|USDT)\.?$/)
  if (minimum && Number(minimum[1]) > 0) return `Minimum amount is ${minimum[1]} ${minimum[2]}.`
  if (/^(?:This |The )?amount is too small to cover (?:the )?(?:bridge |network )?fees?\.(?: Enter a larger amount\.)?$/i.test(message)) return 'Amount is too small to cover fees.'
  return null
}
