import PocketBottomSheet from './PocketBottomSheet'

export type PocketAssetHolding = {
  id: string
  symbol: string
  icon: string
  network: string
  networkIcon: string
  quantity: number
  valueUsd: number
  known: boolean
  stale?: boolean
}

export default function PocketAssetsSheet({ holdings, total, complete, visible, onClose }: {
  holdings: PocketAssetHolding[]; total: number; complete: boolean; visible: boolean; onClose: () => void
}) {
  const held = holdings.filter(row => row.known && row.quantity > 0).sort((a, b) => b.valueUsd - a.valueUsd)
  const needsRefresh = !complete || holdings.some(row => row.stale)
  const amount = (value: number) => !visible ? '••••' : value > 0 && value < 0.01 ? '<$0.01' : new Intl.NumberFormat('en', {style: 'currency', currency: 'USD'}).format(value)
  return <PocketBottomSheet title="Your assets" onClose={onClose}>
    <div className="pb-4 pr-10">
      <h2 className="text-xl font-semibold tracking-tight">Your assets</h2>
      {complete && <p className="mt-1 text-sm tabular-nums text-gray-500 dark:text-gray-400">{amount(total)}</p>}
    </div>
    <ul className="min-h-40 divide-y divide-gray-100 pb-2 dark:divide-white/[0.07]">
      {held.map(row => <li key={row.id} className="flex items-center gap-3 py-4">
        <span className="relative h-9 w-9 shrink-0">
          <img src={row.icon} alt="" className="h-9 w-9 rounded-full object-cover grayscale contrast-200 dark:invert" />
          <img src={row.networkIcon} alt="" className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-white object-cover grayscale contrast-200 dark:border-[#121212] dark:bg-[#121212]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{row.symbol}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{row.network}</p>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <p className="text-sm font-medium">{visible ? new Intl.NumberFormat('en', {maximumFractionDigits: 6}).format(row.quantity) : '••••'}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{amount(row.valueUsd)}</p>
        </div>
      </li>)}
      {!held.length && <li className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">{needsRefresh ? 'Your balances will appear when the connection returns.' : 'Your assets will appear here when you add funds.'}</li>}
    </ul>
  </PocketBottomSheet>
}
