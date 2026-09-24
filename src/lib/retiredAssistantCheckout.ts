/** Retired first-party assistant offers must never open a payable checkout. */
export function isRetiredAssistantCheckout(params: URLSearchParams): boolean {
  return params.getAll('id').some(id => /^agent-hash-pro-/i.test(id.trim()))
    || params.getAll('src').some(source => source.trim().toLowerCase() === 'telegram-helper')
}
