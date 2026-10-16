import usePocketXLayerStablecoins from '../hooks/usePocketXLayerStablecoins'
import { useCallback, useSyncExternalStore } from 'react'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketDisplayCurrency from '../hooks/usePocketDisplayCurrency'
import { balanceOwner, readCachedPocketBalance, subscribePocketBalance } from '../lib/pocketBalanceCache'
import { formatPocketDisplayAmount } from '../lib/pocketMoney'
import PocketLocalEquivalent from './PocketLocalEquivalent'
import PocketAmountShimmer from './PocketAmountShimmer'

/** Display-only: the existing wallet refresh owns balance requests. */
function Balance({ network, asset = 'USDC' }: { network: string; asset?: 'USDC' | 'USDT' }) {
  const { authenticated, email } = usePocketIdentity()
  const owner = authenticated ? balanceOwner(email) : ''
  const currency = usePocketDisplayCurrency()
  const subscribe = useCallback((notify: () => void) => subscribePocketBalance(owner, notify), [owner])
  const snapshot = useCallback(() => readCachedPocketBalance(owner), [owner])
  const saved = useSyncExternalStore(subscribe, snapshot, () => undefined)
  const row = saved?.displayRows.find(item => item.key === network)
  const known = asset === 'USDT' ? typeof row?.usdt === 'number' : row?.known
  const balance = (asset === 'USDT' ? row?.usdt : row?.balance) ?? 0
  if (!authenticated) return null
  return <span className="shrink-0 py-2 text-right tabular-nums">
    <span className="block text-sm font-semibold">{known ? `${formatPocketDisplayAmount(balance)} ${asset}` : <PocketAmountShimmer label={`Loading ${network} balance`} />}</span>
    {currency !== 'USDC' && (known
      ? <PocketLocalEquivalent amount={balance} asset={asset} className="mt-0.5 text-xs font-normal text-gray-500 dark:text-gray-400" />
      : <span className="mt-0.5 block"><PocketAmountShimmer label={`Loading ${network} local equivalent`} className="w-16 overflow-hidden" /></span>)}
  </span>
}

function XLayerBalance({asset}:{asset:'USDC'|'USDT'}) {
  const wallet = usePocketXLayerStablecoins()
  const row = wallet.holdings.find(row=>row.symbol===asset)!
  const currency = usePocketDisplayCurrency()
  return <span className="shrink-0 py-2 text-right tabular-nums">
    <span className="block text-sm font-semibold">{row.known ? formatPocketDisplayAmount(row.quantity)+' '+asset : <PocketAmountShimmer label="Loading X Layer balance"/>}</span>
    {currency !== 'USDC' && (row.known
      ? <PocketLocalEquivalent amount={row.quantity} asset={asset} className="mt-0.5 text-xs font-normal text-gray-500 dark:text-gray-400" />
      : <span className="mt-0.5 block"><PocketAmountShimmer label="Loading X Layer local equivalent" className="w-16 overflow-hidden" /></span>)}
  </span>
}

export default function PocketNetworkBalance({ network, asset = 'USDC' }: { network: string; asset?: 'USDC' | 'USDT' }) {
  return network === 'xlayer' ? <XLayerBalance asset={asset}/> : ['base', 'arbitrum', 'arc', 'solana', 'ethereum', 'polygon'].includes(network) ? <Balance asset={asset} network={network} /> : null
}
