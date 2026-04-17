import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import {
  Link2,
  Copy,
  CheckCheck,
  ArrowRight,
  Tag,
  Coins,
  ExternalLink,
  Sparkles,
  Info,
  XCircle,
} from 'lucide-react'
import { isAddress } from 'viem'
import { cn, truncateAddress, formatAmount, copyToClipboard } from '../lib/utils'
import { useStarknet } from '../lib/StarknetContext'

// ─── Starknet address: 0x followed by 1–64 hex chars ────────────────────────
const isValidStarkAddr = (v: string) => /^0x[0-9a-fA-F]{1,64}$/.test(v)

export default function CreateLink() {
  const [evmAddr, setEvmAddr] = useState('')
  const [starkAddr, setStarkAddr] = useState('')
  const [amt, setAmt] = useState('')
  const [memo, setMemo] = useState('')
  const [generatedLink, setGeneratedLink] = useState('')
  const [copied, setCopied] = useState(false)

  // ── Connected wallet auto-fill ─────────────────────────────────────────
  const { address: connectedEvm } = useAccount()
  const { address: connectedStark } = useStarknet()

  useEffect(() => {
    if (connectedEvm && evmAddr === '') setEvmAddr(connectedEvm)
  }, [connectedEvm])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (connectedStark && starkAddr === '') setStarkAddr(connectedStark)
  }, [connectedStark])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Validation ─────────────────────────────────────────────────────────
  const evmDirty   = evmAddr.length > 0
  const starkDirty = starkAddr.length > 0
  const amtDirty   = amt.length > 0

  const evmValid   = isAddress(evmAddr)          // strict: 0x + 40 hex
  const starkValid = isValidStarkAddr(starkAddr)  // 0x + 1–64 hex
  const isValidAmt = amtDirty && parseFloat(amt) > 0 && !isNaN(parseFloat(amt))

  // Need ≥1 valid address, no dirty-invalid fields, valid amount
  const hasAtLeastOne  = evmValid || starkValid
  const noInvalidInput = (!evmDirty || evmValid) && (!starkDirty || starkValid)
  const canGenerate    = hasAtLeastOne && noInvalidInput && isValidAmt

  // ── Handlers ──────────────────────────────────────────────────────────
  function handleGenerate() {
    if (!canGenerate) return
    const params = new URLSearchParams({ amt })
    if (evmValid)    params.set('evm', evmAddr)
    if (starkValid)  params.set('stark', starkAddr)
    if (memo.trim()) params.set('memo', memo.trim())
    setGeneratedLink(`${window.location.origin}/pay?${params.toString()}`)
  }

  async function handleCopy() {
    if (!generatedLink) return
    await copyToClipboard(generatedLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  function handleReset() {
    setEvmAddr('')
    setStarkAddr('')
    setAmt('')
    setMemo('')
    setGeneratedLink('')
    setCopied(false)
  }

  return (
    <div className="mx-auto max-w-lg animate-fade-in">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="mb-8 text-center">
        <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3.5 py-1.5 text-xs font-semibold text-[#0071E3]">
          <Sparkles className="h-3.5 w-3.5" />
          Multi-Chain PayFi
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-[2.25rem]">
          Create a Hash PayLink
        </h1>
        <p className="mt-2 text-[15px] text-gray-500 text-balance">
          Request USDC or HSK from anyone — no app, no signup, just a link.
        </p>
      </div>

      {/* ── Form card ─────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">
        <div className="space-y-5 p-6 sm:p-8">

          {/* ── EVM Address ──────────────────────────────────────────── */}
          <fieldset className="space-y-1.5">
            <label className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                {/* Blue + Gold dots = Base + HashKey */}
                <span className="flex items-center gap-0.5">
                  <span className="h-2 w-2 rounded-full bg-[#0052FF]" />
                  <span className="h-2 w-2 rounded-full bg-[#C9A227]" />
                </span>
                EVM Address
              </span>
              <span className="text-[11px] font-medium text-gray-400">Base · HashKey</span>
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="0x… (40 hex chars)"
                value={evmAddr}
                onChange={(e) => { setEvmAddr(e.target.value.trim()); setGeneratedLink('') }}
                spellCheck={false}
                autoComplete="off"
                className={cn(
                  'w-full rounded-xl border bg-gray-50/60 px-4 py-3 font-mono text-sm',
                  'placeholder:text-gray-400 transition-all focus:bg-white focus:outline-none focus:ring-2',
                  evmDirty && !evmValid
                    ? 'border-red-300 pr-10 text-red-600 focus:ring-red-100'
                    : evmValid
                    ? 'border-emerald-300 text-gray-900 focus:ring-emerald-100'
                    : 'border-gray-200 text-gray-900 focus:border-[#0071E3]/40 focus:ring-[#0071E3]/15',
                )}
              />
              {evmDirty && !evmValid && (
                <XCircle className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-400" />
              )}
            </div>
            {evmDirty && !evmValid && (
              <p className="flex items-center gap-1 text-xs text-red-500">
                <Info className="h-3 w-3" /> Must be a valid EVM address (0x + 40 hex chars)
              </p>
            )}
            {evmValid && (
              <p className="flex items-center gap-1 text-xs text-emerald-600">
                <CheckCheck className="h-3 w-3" />
                {connectedEvm && evmAddr.toLowerCase() === connectedEvm.toLowerCase()
                  ? `Auto-filled · ${truncateAddress(evmAddr, 8)}`
                  : truncateAddress(evmAddr, 8)}
              </p>
            )}
          </fieldset>

          {/* ── Starknet Address ─────────────────────────────────────── */}
          <fieldset className="space-y-1.5">
            <label className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <span className="h-2 w-2 rounded-full bg-[#8B5CF6]" />
                Starknet Address
              </span>
              <span className="text-[11px] font-medium text-gray-400">optional · Starknet Mainnet</span>
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="0x… (up to 64 hex chars)"
                value={starkAddr}
                onChange={(e) => { setStarkAddr(e.target.value.trim()); setGeneratedLink('') }}
                spellCheck={false}
                autoComplete="off"
                className={cn(
                  'w-full rounded-xl border bg-gray-50/60 px-4 py-3 font-mono text-sm',
                  'placeholder:text-gray-400 transition-all focus:bg-white focus:outline-none focus:ring-2',
                  starkDirty && !starkValid
                    ? 'border-red-300 pr-10 text-red-600 focus:ring-red-100'
                    : starkValid
                    ? 'border-purple-300 text-gray-900 focus:ring-purple-100'
                    : 'border-gray-200 text-gray-900 focus:border-[#8B5CF6]/40 focus:ring-[#8B5CF6]/15',
                )}
              />
              {starkDirty && !starkValid && (
                <XCircle className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-400" />
              )}
            </div>
            {starkDirty && !starkValid && (
              <p className="flex items-center gap-1 text-xs text-red-500">
                <Info className="h-3 w-3" /> Must be a valid Starknet address (0x + hex)
              </p>
            )}
            {starkValid && (
              <p className="flex items-center gap-1 text-xs text-purple-600">
                <CheckCheck className="h-3 w-3" />
                {connectedStark && starkAddr.toLowerCase() === connectedStark.toLowerCase()
                  ? `Auto-filled · ${truncateAddress(starkAddr, 8)}`
                  : truncateAddress(starkAddr, 8)}
              </p>
            )}
          </fieldset>

          {/* ── Amount ───────────────────────────────────────────────── */}
          <fieldset className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Coins className="h-3.5 w-3.5 text-gray-400" />
              Amount
            </label>
            <div className="relative">
              <input
                type="number"
                placeholder="0.0"
                min="0"
                step="any"
                value={amt}
                onChange={(e) => { setAmt(e.target.value); setGeneratedLink('') }}
                className={cn(
                  'w-full rounded-xl border bg-gray-50/60 px-4 py-3 pr-28 text-sm',
                  'placeholder:text-gray-400 transition-all focus:bg-white focus:outline-none focus:ring-2',
                  amtDirty && !isValidAmt
                    ? 'border-red-300 focus:ring-red-100'
                    : 'border-gray-200 focus:border-[#0071E3]/40 focus:ring-[#0071E3]/15',
                )}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-gray-400 whitespace-nowrap">
                USDC · HSK
              </span>
            </div>
            {amtDirty && !isValidAmt && (
              <p className="flex items-center gap-1 text-xs text-red-500">
                <Info className="h-3 w-3" /> Enter a valid amount greater than 0
              </p>
            )}
            {!amtDirty && (
              <p className="text-[11px] text-gray-400">
                USDC on Base/Starknet · HSK on HashKey — payer chooses the chain
              </p>
            )}
          </fieldset>

          {/* ── Memo ─────────────────────────────────────────────────── */}
          <fieldset className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Tag className="h-3.5 w-3.5 text-gray-400" />
              Memo
              <span className="text-xs font-normal text-gray-400">(optional · stored on-chain)</span>
            </label>
            <input
              type="text"
              placeholder="Coffee, Invoice #042, Split dinner…"
              value={memo}
              maxLength={100}
              onChange={(e) => { setMemo(e.target.value); setGeneratedLink('') }}
              className="w-full rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3 text-sm placeholder:text-gray-400 transition-all focus:border-[#0071E3]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15"
            />
          </fieldset>

          {/* ── Generate button ───────────────────────────────────────── */}
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition-all duration-200',
              canGenerate
                ? 'bg-black text-white shadow-button hover:bg-gray-800 hover:shadow-md active:scale-[0.98]'
                : 'cursor-not-allowed bg-gray-100 text-gray-400',
            )}
          >
            <Link2 className="h-4 w-4" />
            Generate Payment Link
            {canGenerate && <ArrowRight className="h-4 w-4" />}
          </button>

          {/* Hint when nothing is filled yet */}
          {!canGenerate && !evmDirty && !starkDirty && (
            <p className="text-center text-xs text-gray-400">
              At least one address is required
            </p>
          )}
        </div>

        {/* ── Generated link panel ─────────────────────────────────────── */}
        {generatedLink && (
          <div className="animate-slide-up border-t border-gray-100 bg-gradient-to-b from-gray-50/80 to-white p-6 sm:px-8 space-y-4">

            {/* Status row */}
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <CheckCheck className="h-4 w-4 text-emerald-500" />
                Link Ready
              </p>
              <button
                onClick={handleReset}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Start over
              </button>
            </div>

            {/* Link string */}
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5">
              <p className="min-w-0 flex-1 truncate font-mono text-xs text-gray-500">
                {generatedLink}
              </p>
            </div>

            {/* Quick preview */}
            <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Preview
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-gray-900">
                  {formatAmount(amt, 18)}
                </span>
                <span className="text-sm font-medium text-gray-500">USDC · HSK</span>
              </div>
              <div className="space-y-1">
                {evmValid && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="flex gap-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#0052FF]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-[#C9A227]" />
                    </span>
                    <span>Base / HashKey:</span>
                    <span className="font-mono text-gray-700">{truncateAddress(evmAddr, 8)}</span>
                  </div>
                )}
                {starkValid && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#8B5CF6]" />
                    <span>Starknet:</span>
                    <span className="font-mono text-gray-700">{truncateAddress(starkAddr, 8)}</span>
                  </div>
                )}
                {memo && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                    <span>Memo: <span className="font-medium text-gray-700">"{memo}"</span></span>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2.5">
              <button
                onClick={handleCopy}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]',
                  copied
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'bg-black text-white hover:bg-gray-800',
                )}
              >
                {copied ? (
                  <><CheckCheck className="h-4 w-4" /> Copied!</>
                ) : (
                  <><Copy className="h-4 w-4" /> Copy Link</>
                )}
              </button>

              <a
                href={generatedLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-all active:scale-[0.98]"
              >
                <ExternalLink className="h-4 w-4" />
                Test
              </a>
            </div>
          </div>
        )}
      </div>

      {/* ── How it works ─────────────────────────────────────────────── */}
      {!generatedLink && (
        <div className="mt-10 animate-fade-in">
          <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            How it works
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { n: '1', title: 'Enter details', body: 'Your EVM + Starknet addresses & amount' },
              { n: '2', title: 'Share the link', body: 'Send via message, email or QR' },
              { n: '3', title: 'Get paid', body: 'They pick a chain & confirm in one tap' },
            ].map(({ n, title, body }) => (
              <div
                key={n}
                className="rounded-xl border border-gray-100 bg-white p-4 text-center shadow-sm"
              >
                <div className="mx-auto mb-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                  {n}
                </div>
                <p className="text-xs font-semibold text-gray-800">{title}</p>
                <p className="mt-0.5 text-xs text-gray-400 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
