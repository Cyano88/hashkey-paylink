export type DeveloperSettlementMode = 'usdc' | 'ngn' | 'ugx'
export const isLocalSettlement = (mode: unknown): mode is 'ngn' | 'ugx' => mode === 'ngn' || mode === 'ugx'
export const developerSettlementCurrency = (mode: 'ngn' | 'ugx'): 'NGN' | 'UGX' => mode === 'ugx' ? 'UGX' : 'NGN'
export const ugandaMobileMoneyProviders = ['MOMOUGPC', 'AIRTUGPC'] as const
