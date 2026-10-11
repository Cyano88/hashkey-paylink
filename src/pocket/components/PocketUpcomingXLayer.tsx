import PocketNetworkMark from './PocketNetworkMark'

export default function PocketUpcomingXLayer() {
  return <button type="button" role="option" aria-selected={false} disabled className="flex min-h-14 w-full items-center gap-3 text-left text-sm font-semibold disabled:cursor-default">
    <PocketNetworkMark network="xlayer" /><span className="flex-1">X Layer</span><span className="text-xs font-normal text-gray-500 dark:text-gray-400">Coming soon</span>
  </button>
}
