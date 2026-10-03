import PocketNetworkBalance from '../../components/PocketNetworkBalance'
import PocketNetworkMark from '../../components/PocketNetworkMark'
import { cn } from '../../../lib/utils'
import { useState } from 'react'
import PocketBottomSheet from '../../components/PocketBottomSheet'
import { ChevronDown } from '../../components/PocketIcons'

type NetworkOption = {
  value: string
  label: string
}

type PocketPayerNetworkPanelProps = {
  disabled?: boolean
  showSelector: boolean
  selectedNetwork: string
  selectedNetworkLabel: string
  options: NetworkOption[]
  multiChain: boolean
  emailReceive: boolean
  onNetworkSelect: (network: string) => void
  onMultiChainToggle: () => void
  showMultiChainToggle?: boolean
  managedNetworkRouting?: boolean
  embedded?: boolean
}

export function PocketPayerNetworkPanel({
  disabled = false,
  showSelector,
  selectedNetwork,
  selectedNetworkLabel,
  options,
  multiChain,
  emailReceive,
  onNetworkSelect,
  onMultiChainToggle,
  showMultiChainToggle = true,
  managedNetworkRouting = false,
  embedded = false,
}: PocketPayerNetworkPanelProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {showSelector && <div className={cn(
        'space-y-2.5',
        embedded
          ? 'border-y border-gray-100 py-3 dark:border-[#262626]'
          : 'rounded-xl border border-gray-100 bg-white p-2.5 shadow-sm dark:border-[#262626] dark:bg-[#121212]',
      )}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Network</p>

          </div>
          <button type="button" aria-label="Select payment network" aria-haspopup="dialog" aria-expanded={open} disabled={multiChain || disabled} onClick={() => setOpen(true)} className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 px-3 text-sm font-semibold disabled:opacity-60 dark:border-[#262626]">
            {!multiChain && <PocketNetworkMark network={selectedNetwork} />}{multiChain ? 'Supported networks' : selectedNetworkLabel}<ChevronDown className="h-4 w-4" />
          </button>
          {open && <PocketBottomSheet title="Select network" onClose={() => setOpen(false)}><h2 className="mb-3 text-sm font-bold">Select network</h2><div role="listbox" aria-label="Payment network">{options.map(option => <button key={option.value} type="button" role="option" aria-selected={option.value === selectedNetwork} onClick={() => {onNetworkSelect(option.value);setOpen(false)}} className="flex min-h-14 w-full items-center justify-between gap-3 text-left text-sm font-semibold"><PocketNetworkMark network={option.value} /><span className="flex-1">{option.label}</span><PocketNetworkBalance network={option.value}/><span aria-hidden="true" className={cn('h-4 w-4 rounded-full border',option.value === selectedNetwork ? 'border-4 border-gray-950 dark:border-white' : 'border-gray-300 dark:border-gray-600')} /></button>)}</div></PocketBottomSheet>}
        </div>

        {showMultiChainToggle && <button
          type="button"
          onClick={onMultiChainToggle}
          role="switch"
          aria-checked={multiChain}
          disabled={emailReceive}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left transition-all hover:border-gray-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70 dark:border-[#262626] dark:bg-[#0D0D0D] dark:shadow-none dark:hover:border-white/20"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">Let payer choose network</span>

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
        </button>}
      </div>}

      {multiChain && !managedNetworkRouting && (
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3.5 py-3 dark:border-[#262626] dark:bg-[#121212]">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Add receiving addresses</p>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">Enter one address for each network payers can choose.</p>
        </div>
      )}
    </>
  )
}
