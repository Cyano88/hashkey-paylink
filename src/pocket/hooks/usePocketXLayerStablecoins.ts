import {formatUnits, getAddress} from 'viem'
import usePocketIdentity from './usePocketIdentity'
import usePocketEmbeddedWallet from './usePocketEmbeddedWallet'
import usePocketStockBalances from './usePocketStockBalances'

export default function usePocketXLayerStablecoins() {
  const identity = usePocketIdentity()
  const wallet = usePocketEmbeddedWallet()
  const address = wallet.address ? getAddress(wallet.address) : undefined
  const balances = usePocketStockBalances(identity.user?.id + ':' + (address || ''), address, identity.getAccessToken)
  const snapshot = balances.displaySnapshot
  const holdings = (['USDC', 'USDT'] as const).map(symbol => {
    const units = symbol === 'USDC' ? snapshot?.cash : snapshot?.usdt
    const quantity = units == null ? 0 : Number(formatUnits(units, 6))
    return {id: 'xlayer-' + symbol.toLowerCase(), symbol, icon: symbol === 'USDC' ? '/brand/usdc-circle-logo.png' : '/brand/usdt.svg', network: 'X Layer', networkIcon: '/brand/xlayer-logo.svg', quantity, valueUsd: quantity, known: !identity.authenticated || units != null, stale: balances.balanceStale}
  })
  return {...wallet, ...balances, address, holdings, complete: holdings.every(row => row.known), total: holdings.reduce((sum, row) => sum + row.valueUsd, 0)}
}
