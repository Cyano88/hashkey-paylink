import { isAddress, parseUnits } from 'viem'
import { getPaycrestOfframpRate } from './paycrest-pos.js'
import { xpaySenderFee } from './pocket/xpay-fee.js'

// Pin the exact provider-supported asset. A matching ticker alone is insufficient.
// Verified against Paycrest GET /v2/tokens on 2026-10-08.
export const PAYCREST_BASE_USDT = {
  symbol: 'USDT', network: 'base', chainId: 8453,
  contractAddress: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6,
} as const

export function verifyPaycrestBaseUsdtCatalogue(rows: unknown) {
  if (!Array.isArray(rows)) throw Error('Paycrest token support could not be verified.')
  const matches = rows.filter(row => row?.symbol === 'USDT' && row?.network === 'base')
  if (matches.length !== 1 || matches[0].contractAddress?.toLowerCase() !== PAYCREST_BASE_USDT.contractAddress.toLowerCase()
    || matches[0].decimals !== PAYCREST_BASE_USDT.decimals) {
    throw Error('Paycrest Base USDT configuration does not match the approved asset.')
  }
  return PAYCREST_BASE_USDT
}

export async function readPaycrestBaseUsdtSupport(fetcher: typeof fetch = fetch) {
  const base = (process.env.PAYCREST_API_BASE || 'https://api.paycrest.io').replace(/\/+$/, '')
  const response = await fetcher(base + '/v2/tokens', {signal:AbortSignal.timeout(10000),redirect:'error'})
  if (!response.ok) throw Error('Paycrest token support is temporarily unavailable.')
  const body = await response.json()
  if (body?.status !== 'success') throw Error('Paycrest token support could not be verified.')
  return verifyPaycrestBaseUsdtCatalogue(body.data)
}

export async function quotePaycrestBaseUsdt(input: {amount: string; fiat: 'NGN' | 'UGX'}, dependencies = {
  support:readPaycrestBaseUsdtSupport, rate:getPaycrestOfframpRate,
}) {
  if (!['NGN','UGX'].includes(input.fiat)) throw Error('Unsupported local currency.')
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(input.amount) || parseUnits(input.amount,6) <= 0n) throw Error('Enter a valid USDT amount.')
  const asset = await dependencies.support()
  const rate = await dependencies.rate({network:asset.network,token:asset.symbol,amount:input.amount,fiat:input.fiat})
  if (!Number.isFinite(rate) || rate <= 0) throw Error('Paycrest did not return a valid USDT rate.')
  return {asset,amount:input.amount,fiat:input.fiat,rate}
}

// Pure order builder for the forthcoming token-aware payout coordinator.
// Intentionally does not post an order or use the legacy amount_usdc store.
// Caller must first bind KYC, beneficiary verification, idempotency and limits.
export function buildPaycrestBaseUsdtOrder(input: {
  amountFiat: string; fiat: 'NGN' | 'UGX'; refundAddress:string; reference:string;
  institution:string; accountIdentifier:string; accountName:string;
}) {
  if (!['NGN','UGX'].includes(input.fiat)) throw Error('Unsupported local currency.')
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(input.amountFiat) || parseUnits(input.amountFiat,2) <= 0n) throw Error('Enter a valid local payout amount.')
  if (!isAddress(input.refundAddress) || /^0x0{40}$/i.test(input.refundAddress)) throw Error('A valid Base refund wallet is required.')
  if (!/^[a-zA-Z0-9_-]{1,90}$/.test(input.reference)) throw Error('A valid payout reference is required.')
  if (![input.institution,input.accountIdentifier,input.accountName].every(value=>typeof value==='string'&&value.trim())) throw Error('Verified recipient details are required.')
  return {
    amount:input.amountFiat, amountIn:'fiat',
    source:{type:'crypto',currency:'USDT',network:'base',refundAddress:input.refundAddress},
    destination:{type:'fiat',currency:input.fiat,recipient:{institution:input.institution,accountIdentifier:input.accountIdentifier,accountName:input.accountName,memo:'Hash PayLink'}},
    reference:input.reference,...xpaySenderFee(),
  }
}
