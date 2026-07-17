import { ChevronDown } from 'lucide-react'
import { cn } from '../../../lib/utils'

type NetworkOption = {
  value: string
  label: string
}

type PocketPayerNetworkPanelProps = {
  showSelector: boolean
  selectedNetwork: string
  selectedNetworkLabel: string
  options: NetworkOption[]
  multiChain: boolean
  emailReceive: boolean
  onNetworkSelect: (network: string) => void
  onMultiChainToggle: () => void
  embedded?: boolean
}

export function PocketPayerNetworkPanel({
  showSelector,
  selectedNetwork,
  selectedNetworkLabel,
  options,
  multiChain,
  emailReceive,
  onNetworkSelect,
  onMultiChainToggle,
  embedded = false,
}: PocketPayerNetworkPanelProps) {
  return (
    <>
      {showSelector && <div className={cn(
        'space-y-2.5',
        embedded
          ? 'border-y border-gray-100 py-3 dark:border-white/[0.07]'
          : 'rounded-xl border border-gray-100 bg-white p-2.5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]',
      )}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Payer network</p>
            <p className="mt-0.5 text-xs font-medium text-gray-700 dark:text-gray-200">
              {multiChain ? 'Payer chooses at checkout' : selectedNetworkLabel}
            </p>
          </div>
          <div className="relative shrink-0">
            <select
              value={multiChain ? 'multi' : selectedNetwork}
              disabled={multiChain}
              onChange={event => onNetworkSelect(event.target.value)}
              className={cn(
                'min-w-[128px] appearance-none rounded-lg border px-3 py-2 pr-8 text-xs font-bold outline-none transition-all',
                multiChain
                  ? 'cursor-default border-gray-200 bg-gray-100 text-gray-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-400'
                  : 'border-gray-900 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950',
              )}
            >
              {multiChain ? (
                <option value="multi">Any supported</option>
              ) : (
                options.map(network => (
                  <option key={network.value} value={network.value}>{network.label}</option>
                ))
              )}
            </select>
            {!multiChain && <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/70 dark:text-gray-500" />}
          </div>
        </div>

        <button
          type="button"
          onClick={onMultiChainToggle}
          disabled={emailReceive}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left transition-all hover:border-gray-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-white/20"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">Let payer choose network</span>
            <span className="block text-[11px] font-medium text-gray-400 dark:text-gray-500">
              {emailReceive
                ? 'Circle Pocket uses the selected network.'
                : multiChain
                  ? 'Add addresses per network.'
                  : 'Use one selected network.'}
            </span>
          </span>
          <span className={cn(
            'relative h-6 w-10 shrink-0 rounded-full p-0.5 transition-all',
            multiChain ? 'bg-gray-950 shadow-inner dark:bg-white' : 'bg-gray-200 dark:bg-white/10',
          )}>
            <span className={cn(
              'block h-5 w-5 rounded-full bg-white shadow-sm transition-transform dark:bg-gray-950',
              multiChain ? 'translate-x-4' : 'translate-x-0',
            )} />
          </span>
        </button>
      </div>}

      {multiChain && (
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Add receiving addresses</p>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">Enter one address for each network payers can choose.</p>
        </div>
      )}
    </>
  )
}
