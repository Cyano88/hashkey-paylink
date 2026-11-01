type SettlementType = 'INSTANT_FIAT' | 'KEEP_CRYPTO'
type PosNetwork = 'base' | 'arbitrum' | 'arc' | 'solana' | 'ethereum' | 'polygon'

function supportedMerchantNetworks(value: unknown): PosNetwork[] {
  const allowed: PosNetwork[] = ['base', 'arbitrum', 'arc', 'solana', 'ethereum', 'polygon']
  const raw = Array.isArray(value) ? value : ['base']
  const selected = raw.filter((item): item is PosNetwork => allowed.includes(item as PosNetwork))
  return selected.length ? Array.from(new Set(selected)) : ['base']
}

export function publicXPayCheckoutUrl(merchant: PublicMerchant, origin = window.location.origin, selectedNetwork?: string) {
  const supported=supportedMerchantNetworks(merchant.supported_networks)
  if(selectedNetwork&&!supported.includes(selectedNetwork as PosNetwork))throw Error('This network is not enabled by the merchant.')
  const network = merchant.payout_preference==='INSTANT_FIAT' ? 'base' : selectedNetwork as PosNetwork || supported[0]
  const url = new URL('/pay', origin)
  url.searchParams.set('f', '1')
  url.searchParams.set('n', network)
  url.searchParams.set('m', merchant.display_name)
  url.searchParams.set('src', 'ngpos')
  url.searchParams.set('merchant', merchant.merchant_id)
  url.searchParams.set('settlement', merchant.payout_preference.toLowerCase())
  if (merchant.payout_preference === 'INSTANT_FIAT') {
    url.searchParams.set('offramp', 'paycrest')
    url.searchParams.set('fx', merchant.country === 'UG' ? 'UGX' : 'NGN')
    url.searchParams.set('fiat_currency', merchant.country === 'UG' ? 'UGX' : 'NGN')
    url.searchParams.set('fs', '1')
    if (merchant.bank_name) url.searchParams.set('bank', merchant.bank_name)
    if (merchant.bank_last4) url.searchParams.set('acct', `****${merchant.bank_last4}`)
    if (merchant.bank_account_name) url.searchParams.set('acctName', merchant.bank_account_name)
  } else if (network === 'solana' && merchant.solana_wallet_address) {
    url.searchParams.set('s', merchant.solana_wallet_address)
  } else {
    const recipient=merchant.network_wallets?merchant.network_wallets[network]:merchant.circle_smart_wallet_address
    if(!recipient)throw Error('Merchant wallet is unavailable on this network.')
    url.searchParams.set('e', recipient)
  }
  return url.toString()
}

type PublicMerchant = {
  merchant_id: string
  display_name: string
  country: 'NG' | 'UG'
  fiat_currency?: 'NGN' | 'UGX'
  payout_preference: SettlementType
  settlement_enabled: boolean
  kyc_status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'RESTRICTED'
  network_wallets?: Partial<Record<PosNetwork,string>>
  circle_smart_wallet_address: string
  solana_wallet_address?: string
  supported_networks?: PosNetwork[]
  bank_configured: boolean
  bank_name?: string
  bank_last4?: string
  bank_account_name?: string
  fx_rate_ngn_per_usdc?: string
  fx_source?: string
}
