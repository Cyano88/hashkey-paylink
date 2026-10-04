import PocketNetworkMark from './PocketNetworkMark'
import PocketLocalEquivalent from './PocketLocalEquivalent'

type Props = {
  network: string
  networkLabel: string
  amount: string
  currency: string
  fixedAmount: boolean
  onAmountChange: (value: string) => void
  requiresName: boolean
  name: string
  onNameChange: (value: string) => void
}

/** Pocket presentation only; checkout retains validation, quotes and payment execution. */
export default function PocketCheckoutFields({ network, networkLabel, amount, currency, fixedAmount, onAmountChange, requiresName, name, onNameChange }: Props) {
  return <section aria-label="Payment details" className="space-y-4">
    <div className="flex min-h-14 items-center justify-between rounded-xl border border-gray-100 bg-white px-3.5 dark:border-[#262626] dark:bg-[#121212]">
      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Network</span>
      <span className="flex items-center gap-2 text-sm font-semibold"><PocketNetworkMark network={network} />{networkLabel}</span>
    </div>
    <label className="block">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Amount</span>
      <span className="mt-2 flex items-center rounded-xl border border-gray-200 bg-white px-3.5 dark:border-[#262626] dark:bg-[#121212]">
        <input aria-label="Amount" type="number" min="0" step="any" inputMode="decimal" value={amount} readOnly={fixedAmount} onChange={event => onAmountChange(event.target.value)} placeholder="0.00" className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" />
        <b className="text-xs text-gray-500 dark:text-gray-400">{currency}</b>
      </span>
      {currency === 'USDC' && Number(amount) > 0 && <PocketLocalEquivalent amount={Number(amount)} />}
    </label>
    {requiresName && <label className="block">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Your name</span>
      <input required type="text" autoComplete="name" value={name} onChange={event => onNameChange(event.target.value)} maxLength={60} placeholder="Enter your name" className="mt-2 min-h-12 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm outline-none focus:border-gray-400 dark:border-[#262626] dark:bg-[#121212]" />
    </label>}
  </section>
}
