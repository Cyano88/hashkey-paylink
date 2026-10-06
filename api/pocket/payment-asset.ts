import { getAddress, parseUnits } from 'viem'
import { stockAssets, stockUsdc } from '../../src/pocket/lib/pocketXStocksWallet.js'

export type PaymentToken = { chainId: 196; address: string; symbol: string; decimals: number }

/** Token identity is explicit; symbols alone must never select a payment asset. */
export function paymentToken(value: PaymentToken | undefined, source: string, settlement: string): PaymentToken | undefined {
  if (!value) return undefined
  const asset = [stockUsdc, ...stockAssets].find(asset => asset.address.toLowerCase() === String(value.address).toLowerCase())
  if (source !== 'xlayer' || settlement !== 'xlayer' || value.chainId !== 196 || !asset
    || asset.symbol !== value.symbol || !Number.isInteger(value.decimals) || value.decimals < 0 || value.decimals > 36
    || (asset.symbol === 'USDC' && value.decimals !== 6)) {
    throw Object.assign(new Error('Payment token is invalid for this network.'), { status: 400 })
  }
  return { chainId: 196, address: getAddress(asset.address), symbol: asset.symbol, decimals: value.decimals }
}

export function paymentAssetAmount(value: unknown, token?: PaymentToken) {
  const amount = typeof value === 'string' ? value.trim() : ''
  const decimals = token?.decimals ?? 6
  if (amount.length > 100 || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount)
    || (amount.split('.')[1]?.length ?? 0) > decimals || parseUnits(amount, decimals) <= 0n || parseUnits(amount, decimals) >= 2n ** 256n) {
    throw Object.assign(new Error('Payment amount is invalid.'), { status: 400 })
  }
  return amount
}
