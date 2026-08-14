import { ArrowLeft, Check, Loader2 } from './PocketIcons'
import type { LocalCurrencyProfile } from '../models/localCurrencyProfile'

type Currency = LocalCurrencyProfile['displayCurrency']
const OPTIONS = [
  ['USDC', 'Default', 'Show balances in USDC', true],
  ['NGN', 'Nigeria', 'Show the Naira equivalent', true],
  ['GHS', 'Ghana', 'Coming soon', false],
  ['KES', 'Kenya', 'Coming soon', false],
] as const

function CurrencyOption({ option, current, busy, choose }: { option: typeof OPTIONS[number]; current: Currency; busy: boolean; choose(currency: Currency): void }) {
  const [code, country, detail, enabled] = option
  return <button type="button" disabled={!enabled || busy} onClick={() => choose(code)} className="flex min-h-[72px] w-full items-center border-b border-gray-100 px-4 text-left last:border-0 dark:border-white/10">
    <span className="flex-1"><b className="block text-sm">{country} <span className="text-xs text-gray-400">({code})</span></b><small className="text-gray-400">{detail}</small></span>
    {busy && current === code ? <Loader2 className="h-4 w-4 animate-spin" /> : current === code ? <Check className="h-5 w-5 text-blue-600" /> : !enabled ? <small className="font-bold text-gray-300">Soon</small> : null}
  </button>
}

export default function PocketDisplayCurrencyPicker({ current, busy, error, onBack, onSelect }: { current: Currency; busy: boolean; error: string; onBack(): void; onSelect(currency: Currency): Promise<boolean> }) {
  const choose = async (currency: Currency) => { if (await onSelect(currency)) onBack() }
  return <div className="fixed inset-0 z-[55] overflow-y-auto bg-[#F5F5F7] text-gray-950 dark:bg-[#0A0A0A] dark:text-white"><main className="mx-auto max-w-[480px] px-5 pb-8 pt-4"><header className="flex h-12 items-center justify-between"><button type="button" onClick={onBack} className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-white/[0.07]" aria-label="Back"><ArrowLeft className="h-4 w-4" /></button><b className="text-sm">Display currency</b><span className="h-10 w-10" /></header><h1 className="mt-8 text-2xl font-black">Choose how balances appear</h1><p className="mt-2 text-xs text-gray-500">USDC remains Pocket's settlement currency.</p><div className="mt-6 overflow-hidden rounded-3xl bg-white dark:bg-white/5">{OPTIONS.map(option => <CurrencyOption key={option[0]} option={option} current={current} busy={busy} choose={currency => void choose(currency)} />)}</div>{error && <p className="mt-3 text-xs text-red-600">{error}</p>}</main></div>
}
