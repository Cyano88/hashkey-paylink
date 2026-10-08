import PocketBottomSheet from './PocketBottomSheet'
import { formatPocketDisplayAmount } from '../lib/pocketMoney'

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
  const unavailable = holdings.filter(row => !row.known)
  const amount = (value: number) => !visible ? '••••' : value > 0 && value < 0.01 ? '<$0.01' : '$' + formatPocketDisplayAmount(value)
  return <PocketBottomSheet title="Your assets" onClose={onClose}>
    <div className="pb-4 pr-10">
      <p className="text-3xl font-semibold tabular-nums tracking-tight">{!visible ? '••••' : complete ? amount(total) : '—'}</p>
      <h2 className="mt-2 text-sm text-gray-500 dark:text-gray-400">Your assets</h2>
    </div>
    <ul className="min-h-40 pb-2">
      {held.map(row => <li key={row.id} className="flex items-center gap-4 py-4">
        <span className="relative h-11 w-11 shrink-0">
          <img src={row.icon} alt="" className="h-11 w-11 rounded-full object-cover" />
          <img src={row.networkIcon} alt="" className="absolute -bottom-0.5 -right-0.5 h-[18px] w-[18px] rounded-full border-2 border-white bg-white object-cover dark:border-black dark:bg-black" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{row.symbol}</p>
          <p className="mt-1 text-xs tabular-nums text-gray-500 dark:text-gray-400">{visible ? new Intl.NumberFormat('en', {maximumFractionDigits: 6}).format(row.quantity) : '••••'} {row.symbol} <span aria-hidden="true">·</span> {row.network}</p>
          {row.stale && <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">Last known balance</p>}
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{amount(row.valueUsd)}</span>
      </li>)}
      {!held.length && !unavailable.length && <li className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Your assets will appear here when you add funds.</li>}
      {unavailable.map(row => <li key={row.id} className="flex items-center justify-between gap-3 py-3 text-xs text-gray-500 dark:text-gray-400"><span>{row.symbol} · {row.network}</span><span>Balance unavailable</span></li>)}
    </ul>
  </PocketBottomSheet>
}
