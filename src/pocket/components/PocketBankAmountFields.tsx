import { Landmark } from './PocketIcons'

type Props = {
  currency?: 'NGN' | 'UGX'
  accountName: string; bankName: string; accountNumber: string
  amount: string; memo: string; disabled?: boolean
  onChangeRecipient: () => void; onAmountChange: (value: string) => void; onMemoChange: (value: string) => void
}
export default function PocketBankAmountFields({currency = 'NGN',accountName,bankName,accountNumber,amount,memo,disabled,onChangeRecipient,onAmountChange,onMemoChange}: Props) {
  const symbol = currency === 'UGX' ? 'UGX' : '\u20a6'
  return <div className="pocket-bank-amount-fields space-y-5">
    <section aria-label="Recipient">
      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Transfer to</p>
      <button type="button" disabled={disabled} onClick={onChangeRecipient} aria-label="Change recipient" className="flex min-h-20 w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left dark:border-[#262626] dark:bg-[#0D0D0D]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-white/5"><Landmark className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{accountName}</span><span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{bankName} · {accountNumber}</span></span>
        <span className="text-xs text-gray-500 dark:text-gray-400">Change</span>
      </button>
    </section>
    <label className="flex min-h-16 items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 focus-within:border-gray-400 dark:border-[#262626] dark:bg-[#0D0D0D]">
      <span aria-hidden="true" className="text-lg font-semibold">{symbol}</span>
      <input aria-label={currency === 'UGX' ? 'Amount in Uganda shillings' : 'Amount in naira'} inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={e=>onAmountChange(e.target.value)} className="min-w-0 flex-1 bg-transparent py-4 text-lg tabular-nums outline-none placeholder:text-gray-400 dark:placeholder:text-gray-600" />
    </label>
    <div aria-label="Suggested amounts" className="flex gap-2 overflow-x-auto pb-1">{[1000,2000,5000,10000].map(value=><button key={value} type="button" onPointerDown={event=>event.preventDefault()} onClick={()=>onAmountChange(String(value))} aria-pressed={Number(amount)===value} className="min-h-10 shrink-0 rounded-lg border border-gray-200 px-3 text-sm tabular-nums aria-pressed:border-gray-950 dark:border-[#262626] dark:aria-pressed:border-white">{symbol}{value.toLocaleString('en')}</button>)}</div>
    <input aria-label="Note (optional)" placeholder="Note (optional)" value={memo} onChange={e=>onMemoChange(e.target.value)} className="min-h-14 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-gray-400 dark:border-[#262626] dark:bg-[#0D0D0D] dark:placeholder:text-gray-600" />
  </div>
}
