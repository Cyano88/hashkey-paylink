import { useEffect, useRef, useState } from 'react'
import { PocketSkeletonBar } from './PocketContentSkeletons'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from './PocketIcons'
import { XMarkIcon as X } from '@heroicons/react/24/outline'
import { POCKET_NATIVE_BACK_EVENT } from '../lib/pocketNativeBack'

export type ArcPickerToken = { address: string; symbol: string; name: string; decimals: number; balance: string | null; balanceStatus: string; logoURI?: string }
function TokenImage({ token, small = false }: { token: ArcPickerToken; small?: boolean }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [token.logoURI])
  return <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-xs font-bold dark:bg-white/10 ${small ? 'h-7 w-7' : 'h-10 w-10'}`}>
    {(token.logoURI?.startsWith('https://') || token.logoURI?.startsWith('/pocket-stocks/') || token.logoURI?.startsWith('/brand/')) && !failed ? <img src={token.logoURI} alt="" className="h-full w-full object-contain" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : token.symbol.slice(0, 2)}
  </span>
}

type Props = { networkLabel?: string; clean?: boolean; initialLimit?: number; balancesLoading?: boolean; label: string; value: string; tokens: ArcPickerToken[]; excluded: string; disabled?: boolean; onChange(token: ArcPickerToken): void; discover(address: string): Promise<ArcPickerToken> }
export default function PocketArcTokenPicker({ label, value, tokens, excluded, disabled, onChange, discover, networkLabel = 'Arc', clean = false, initialLimit = 12, balancesLoading = false }: Props) {
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<ArcPickerToken | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const discovery = useRef(discover); discovery.current = discover
  const selected = tokens.find(t => t.address.toLowerCase() === value.toLowerCase())
  const normalized = query.trim().toLowerCase()
  const available = tokens.filter(t => t.address.toLowerCase() !== excluded.toLowerCase())
  const filtered = available.filter(t => !normalized || [t.symbol, t.name, t.address].some(v => v.toLowerCase().includes(normalized)))
  const listed = normalized ? filtered : [...available].sort((a, b) => Number(Number(b.balance) > 0) - Number(Number(a.balance) > 0)).slice(0, initialLimit)
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    root.current?.focus()
    const close = (event: Event) => { event.preventDefault(); setOpen(false) }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(event)
      if (event.key === 'Tab') {
        const items = root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex="0"]')
        if (!items?.length) return
        const first = items[0], last = items[items.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    window.addEventListener(POCKET_NATIVE_BACK_EVENT, close)
    document.addEventListener('keydown', key)
    return () => { document.body.style.overflow = previous; window.removeEventListener(POCKET_NATIVE_BACK_EVENT, close); document.removeEventListener('keydown', key); trigger.current?.focus() }
  }, [open])
  useEffect(() => {
    setFound(null); setError(''); setLoading(false)
    if (!open || !/^0x[0-9a-f]{40}$/i.test(normalized) || filtered.length || normalized === excluded.toLowerCase()) return
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(() => { void discovery.current(normalized).then(token => { if (!cancelled) setFound(token) }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Token lookup is unavailable.') }).finally(() => { if (!cancelled) setLoading(false) }) }, 400)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [open, normalized, filtered.length, excluded])
  function select(token: ArcPickerToken) { onChange(token); setOpen(false) }
  return <>
    <button ref={trigger} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => { setQuery(''); setSearching(false); setOpen(true) }} className="flex min-h-12 w-full items-center justify-between gap-2 rounded-2xl border border-gray-200 px-3 py-3 text-sm font-bold disabled:opacity-40 dark:border-[#262626]">
      {selected && <TokenImage token={selected} small />}<span className="min-w-0 flex-1 truncate text-left">{selected?.symbol || 'Select token'}</span><ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
    </button>
    {open && createPortal(<div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/40 pt-[var(--pocket-safe-top)] sm:items-center" onClick={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <div ref={root} style={{ maxHeight: 'min(85dvh, calc(100dvh - var(--pocket-safe-top) - 1rem))' }} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-[28px] bg-white p-5 pb-[max(1.25rem,var(--pocket-safe-bottom))] text-gray-950 shadow-xl outline-none dark:bg-gray-950 dark:text-white sm:rounded-[28px]">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">Select token</h2><button type="button" aria-label="Close token picker" onClick={() => setOpen(false)} className="rounded-full p-2"><X className="h-5 w-5" /></button></div>
        {searching ? <label className="mb-3 flex items-center gap-2 rounded-2xl bg-gray-50 px-3 dark:bg-white/5"><Search className="h-4 w-4 shrink-0 text-gray-400" /><input autoFocus aria-label={`Search ${networkLabel} tokens or paste contract`} placeholder="Search name or paste contract" value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" /></label> : <button type="button" onClick={() => setSearching(true)} className="mb-3 flex items-center gap-2 rounded-2xl bg-gray-50 px-3 py-3 text-left text-sm text-gray-500 dark:bg-white/5"><Search className="h-4 w-4" />Search or paste contract</button>}
        {!clean && <p className="mb-2 text-xs text-gray-400">{normalized ? 'Search results on ' + networkLabel : 'Available on ' + networkLabel + ' · your tokens first'}</p>}
        <div className="min-h-0 overflow-y-auto overscroll-contain">
          {[...listed, ...(found ? [found] : [])].map(token => <button type="button" key={token.address} onClick={() => select(token)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/5">
            <TokenImage token={token} />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{token.symbol}</span><span className="block truncate text-xs text-gray-400">{token.name}</span>{normalized.startsWith('0x') && <span className="block break-all text-[10px] text-gray-400">{token.address}</span>}</span>
            {balancesLoading ? <PocketSkeletonBar className="h-3 w-14" /> : <span className="max-w-24 truncate text-xs tabular-nums">{token.balance ?? '—'}</span>}{token.address.toLowerCase() === value.toLowerCase() && <Check className="h-4 w-4 shrink-0" />}
          </button>)}
          {loading && <p role="status" className="py-6 text-center text-xs text-gray-400">Looking up token…</p>}
          {error && <p role="alert" className="py-4 text-xs text-red-600">{error}</p>}
          {!listed.length && !found && !loading && !error && <p className="py-6 text-center text-xs text-gray-400">No matching token. Search by name or contract.</p>}
        </div>
      </div>
    </div>, document.body)}
  </>
}
