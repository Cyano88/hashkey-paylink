export type ProductCapability = 'hosted_checkout' | 'arc_agreements' | 'xstocks_agreements' | 'swap_arc' | 'swap_xlayer' | 'polymarket_funding'
export const PRODUCT_GROUPS = [
  { id: 'checkout', title: 'Checkout', description: 'Accept payments into your configured receiving account.', options: [
    { capability: 'hosted_checkout', title: 'Hosted checkout', detail: 'Choose settlement networks below. Agent checkout supports Base and Arc.' },
  ] },
  { id: 'agreements', title: 'Agreements', description: 'Choose the assets and network for protected payments.', options: [
    { capability: 'arc_agreements', title: 'Arc', detail: 'USDC. Mainnet funding requires separate activation.' },
    { capability: 'xstocks_agreements', title: 'X Layer', detail: 'Eligible xStocks. Trade funding first; work agreements activate separately. The recipient is bound to each agreement.' },
  ] },
  { id: 'swap', title: 'Swap', description: 'Swap within a network using the user\'s connected wallet. Agreements are not required.', options: [
    { capability: 'swap_arc', title: 'Arc', detail: 'USDC and eligible Arc assets. User approval is required.' },
    { capability: 'swap_xlayer', title: 'X Layer', detail: 'Eligible xStocks and trading assets. User approval is required.' },
  ] },
  { id: 'bridge', title: 'Bridge', description: 'Move eligible assets between networks.', options: [] },
  { id: 'funding', title: 'Polymarket funding', description: 'A separate live funding flow with bridge and minimum-amount checks.', options: [
    { capability: 'polymarket_funding', title: 'Base and Arbitrum', detail: 'No sandbox funding. This does not enable general-purpose bridging.' },
  ] },
] as const
export const BUILDER_BRIDGE_UNAVAILABLE = 'Builder bridge API is not available yet. Pocket bridge support does not enable project routes. X Layer and xStocks bridging are not supported.'
export function productAllowed(mode: 'human' | 'agentic', capability: string) {
  return mode === 'human' || capability === 'hosted_checkout' || capability === 'arc_agreements'
}
export function needsSettlementRouting(capabilities: readonly string[]) {
  return capabilities.some(value => ['hosted_checkout', 'arc_agreements', 'polymarket_funding'].includes(value))
}
// Old projects may have explicitly authorized Swap before it had its own product.
// Preserve only that authorization; selecting Agreements alone never grants Swap.
export function effectiveProductCapabilities(project: {
  capabilities?: readonly ProductCapability[]; productSettingsVersion?: number;
  keys?: Array<{ scopes?: readonly string[]; revokedAt?: string; expiresAt?: string }>
}, now = Date.now()): ProductCapability[] {
  const capabilities = [...(project.capabilities?.length ? project.capabilities : ['hosted_checkout'] as const)]
  if (project.productSettingsVersion !== 2 && project.keys?.some(key => key.scopes?.includes('wallet:swap') && !key.revokedAt && (!key.expiresAt || Date.parse(key.expiresAt) > now))) {
    if (capabilities.includes('arc_agreements')) capabilities.push('swap_arc')
    if (capabilities.includes('xstocks_agreements')) capabilities.push('swap_xlayer')
  }
  return [...new Set(capabilities)]
}
