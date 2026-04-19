import { useEffect, useState } from 'react'
import {
  useAccount,
  useChainId,
  useSwitchChain,
  usePublicClient,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi'
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
  ShieldCheck,
  Loader2,
  Zap,
  AlertTriangle,
  Wallet,
} from 'lucide-react'
import { isAddress } from 'viem'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { cn, truncateAddress, formatAmount, copyToClipboard } from '../lib/utils'
import { useStarknet } from '../lib/StarknetContext'
import { CHAIN_META, type ChainKey } from '../lib/chains'
import { EVM_CLIENTS, ROUTER_FACTORY, FACTORY_GET_ROUTER_ABI, FACTORY_DEPLOY_ROUTER_ABI } from '../lib/router'

// ─── Starknet address: 0x followed by exactly 64 hex chars ──────────────────
const isValidStarkAddr = (v: string) => /^0x[0-9a-fA-F]{64}$/.test(v)

const CHAINS: ChainKey[] = ['base', 'starknet', 'hashkey', 'arc']

type VaultStep = 'idle' | 'checking' | 'needs_deploy' | 'deploying' | 'ready' | 'skipped'

export default function CreateLink() {
  const [evmAddr,       setEvmAddr]       = useState('')
  const [starkAddr,     setStarkAddr]     = useState('')
  const [amt,           setAmt]           = useState('')
  const [memo,          setMemo]          = useState('')
  const [generatedLink, setGeneratedLink] = useState('')
  const [copied,        setCopied]        = useState(false)
  const [previewChain,  setPreviewChain]  = useState<ChainKey>('base')
  const [vaultStep,     setVaultStep]     = useState<VaultStep>('idle')
  const [deployError,   setDeployError]   = useState<string | null>(null)
  // Background check — null=checking, true=deployed, false=not deployed
  const [routerDeployed, setRouterDeployed] = useState<boolean | null>(null)

  // ── Wallet hooks ──────────────────────────────────────────────────────────
  const { isConnected, address: connectedEvm } = useAccount()
  const { address: connectedStark }            = useStarknet()
  const chainId                                = useChainId()
  const { switchChain, isPending: isSwitching } = useSwitchChain()

  const baseChainId  = CHAIN_META.base.chainId
  const isOnBase     = chainId === baseChainId
  const publicClient = usePublicClient({ chainId: baseChainId })

  const {
    writeContract: callDeployRouter,
    data:          deployTxHash,
    isPending:     isDeployPending,
    reset:         resetDeploy,
  } = useWriteContract()

  const { isSuccess: isDeployConfirmed, isError: isDeployReverted } =
    useWaitForTransactionReceipt({ hash: deployTxHash })

  // When deploy tx confirms, mark vault as ready
  useEffect(() => {
    if (isDeployConfirmed) setVaultStep('ready')
  }, [isDeployConfirmed])

  useEffect(() => {
    if (isDeployReverted) setDeployError('Transaction reverted. Please try again.')
  }, [isDeployReverted])

  // ── Connected wallet auto-fill ─────────────────────────────────────────
  useEffect(() => {
    if (connectedEvm && evmAddr === '') setEvmAddr(connectedEvm)
  }, [connectedEvm])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (connectedStark && starkAddr === '') setStarkAddr(connectedStark)
  }, [connectedStark])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset vault step when address changes ─────────────────────────────
  useEffect(() => {
    setVaultStep('idle')
    setGeneratedLink('')
    setDeployError(null)
    setRouterDeployed(null)
    resetDeploy()
  }, [evmAddr])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Background router check (no wallet needed — uses public client) ────
  // Once a router is deployed for this address, every future link auto-shows Active.
  useEffect(() => {
    if (!isAddress(evmAddr)) { setRouterDeployed(null); return }
    let cancelled = false
    setRouterDeployed(null)
    async function checkDeployment() {
      try {
        const factory = ROUTER_FACTORY['base']
        if (!factory) { if (!cancelled) setRouterDeployed(false); return }
        const router = await EVM_CLIENTS.base.readContract({
          address: factory, abi: FACTORY_GET_ROUTER_ABI,
          functionName: 'getRouterAddress', args: [evmAddr as `0x${string}`],
        })
        const code = await EVM_CLIENTS.base.getBytecode({ address: router })
        if (!cancelled) setRouterDeployed(!!code && code.length > 2)
      } catch {
        if (!cancelled) setRouterDeployed(false)
      }
    }
    checkDeployment()
    return () => { cancelled = true }
  }, [evmAddr])

  // ── Validation ─────────────────────────────────────────────────────────
  const evmDirty   = evmAddr.length > 0
  const starkDirty = starkAddr.length > 0
  const amtDirty   = amt.length > 0

  const evmValid   = isAddress(evmAddr)
  const starkValid = isValidStarkAddr(starkAddr)
  const isValidAmt = amtDirty && parseFloat(amt) > 0 && !isNaN(parseFloat(amt))

  const hasAtLeastOne  = evmValid || starkValid
  const noInvalidInput = (!evmDirty || evmValid) && (!starkDirty || starkValid)
  const canGenerate    = hasAtLeastOne && noInvalidInput && isValidAmt

  // ── Build link URL ─────────────────────────────────────────────────────
  function buildLink() {
    const params = new URLSearchParams({ amt })
    if (evmValid)    params.set('evm', evmAddr)
    if (starkValid)  params.set('stark', starkAddr)
    if (memo.trim()) params.set('memo', memo.trim())
    return `${window.location.origin}/pay?${params.toString()}`
  }

  // ── Generate handler ───────────────────────────────────────────────────
  async function handleGenerate() {
    if (!canGenerate) return
    const link = buildLink()

    // Master Router: if background check already confirmed router is deployed → instant ready
    if (evmValid && routerDeployed === true) {
      setGeneratedLink(link)
      setVaultStep('ready')
      return
    }

    // No EVM address → just show link (no vault for Starknet-only links)
    if (!evmValid) {
      setGeneratedLink(link)
      setVaultStep('skipped')
      return
    }

    // Background check still running → do a fresh on-chain check
    setVaultStep('checking')
    setDeployError(null)

    try {
      const factory = ROUTER_FACTORY['base']
      if (!factory) { setGeneratedLink(link); setVaultStep('skipped'); return }

      const router = await EVM_CLIENTS.base.readContract({
        address: factory, abi: FACTORY_GET_ROUTER_ABI,
        functionName: 'getRouterAddress', args: [evmAddr as `0x${string}`],
      })
      const code     = await EVM_CLIENTS.base.getBytecode({ address: router })
      const deployed = !!code && code.length > 2

      setRouterDeployed(deployed)
      setGeneratedLink(link)
      setVaultStep(deployed ? 'ready' : 'needs_deploy')
    } catch {
      setGeneratedLink(link)
      setVaultStep('skipped')
    }
  }

  // ── Deploy vault handler ───────────────────────────────────────────────
  async function handleDeployVault() {
    const factory = ROUTER_FACTORY['base']
    if (!factory || !evmValid) return
    setDeployError(null)
    setVaultStep('deploying')
    try {
      callDeployRouter({
        address: factory,
        abi: FACTORY_DEPLOY_ROUTER_ABI,
        functionName: 'deployRouter',
        args: [evmAddr as `0x${string}`],
        chainId: baseChainId,
      })
    } catch (err) {
      setDeployError(err instanceof Error ? err.message.slice(0, 120) : 'Deploy failed')
      setVaultStep('needs_deploy')
    }
  }

  // ── Copy / reset ───────────────────────────────────────────────────────
  async function handleCopy() {
    if (!generatedLink) return
    await copyToClipboard(generatedLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  function handleReset() {
    setEvmAddr(''); setStarkAddr(''); setAmt(''); setMemo('')
    setGeneratedLink(''); setCopied(false)
    setVaultStep('idle'); setDeployError(null); setRouterDeployed(null); resetDeploy()
  }

  // ── Vault status helpers ───────────────────────────────────────────────
  const isChecking     = vaultStep === 'checking'
  const needsDeploy    = vaultStep === 'needs_deploy'
  const isDeploying    = vaultStep === 'deploying' || isDeployPending
  const vaultReady     = vaultStep === 'ready'
  const vaultSkipped   = vaultStep === 'skipped'
  const linkReady      = generatedLink !== '' && !isChecking

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

        {/* ── Chain preview toggle ──────────────────────────────────── */}
        <div className="mt-5 flex flex-col items-center gap-2.5">
          <div className="flex flex-wrap items-center justify-center gap-1 rounded-xl border border-gray-200 bg-gray-100/80 p-1 max-w-xs sm:max-w-none sm:inline-flex">
            {CHAINS.map((c) => {
              const m = CHAIN_META[c]
              const isActive = previewChain === c
              return (
                <button
                  key={c}
                  onClick={() => setPreviewChain(c)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150',
                    isActive ? m.toggleActive : 'text-gray-500 hover:text-gray-800',
                  )}
                >
                  <span className={cn(
                    'h-1.5 w-1.5 rounded-full transition-colors',
                    isActive ? 'bg-white/80' : m.dotColor,
                  )} />
                  {m.label}
                </button>
              )
            })}
          </div>
          {(() => {
            const m = CHAIN_META[previewChain]
            return (
              <span className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-all duration-200',
                m.badgeBg, m.badgeText, m.badgeBorder,
              )}>
                <span className={cn('h-1.5 w-1.5 rounded-full', m.dotColor)} />
                {m.engineLabel}
              </span>
            )
          })()}
        </div>
      </div>

      {/* ── Form card ─────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">
        <div className="space-y-5 p-6 sm:p-8">

          {/* ── EVM Address ──────────────────────────────────────────── */}
          <fieldset className="space-y-1.5">
            <label className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
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
                onChange={(e) => setEvmAddr(e.target.value.trim())}
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
              <p className="flex items-center gap-1.5 text-xs text-emerald-600">
                <CheckCheck className="h-3 w-3" />
                {connectedEvm && evmAddr.toLowerCase() === connectedEvm.toLowerCase()
                  ? `Auto-filled · ${truncateAddress(evmAddr, 8)}`
                  : truncateAddress(evmAddr, 8)}
                {routerDeployed === true && (
                  <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                    Vault Active
                  </span>
                )}
                {routerDeployed === null && evmValid && (
                  <span className="ml-1 text-[10px] text-gray-400">checking vault…</span>
                )}
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
                placeholder="0x… (exactly 64 hex chars)"
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
                <Info className="h-3 w-3" /> Must be a valid 64-character Starknet address.
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

          {/* ── Generate / checking button ───────────────────────────── */}
          {vaultStep === 'idle' && (
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
          )}

          {isChecking && (
            <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-100 px-6 py-3.5 text-sm font-semibold text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking payment vault…
            </div>
          )}

          {!canGenerate && !evmDirty && !starkDirty && vaultStep === 'idle' && (
            <p className="text-center text-xs text-gray-400">
              At least one address is required
            </p>
          )}
        </div>

        {/* ── Vault activation panel ───────────────────────────────────── */}
        {(needsDeploy || isDeploying || vaultReady || vaultSkipped) && linkReady && (
          <div className="animate-slide-up border-t border-gray-100 bg-gradient-to-b from-gray-50/80 to-white p-6 sm:px-8 space-y-4">

            {/* Vault status header */}
            {(needsDeploy || isDeploying) && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Activate your payment vault</p>
                    <p className="mt-0.5 text-xs text-amber-700 leading-relaxed">
                      One-time setup on Base (~$0.01 gas). Once active, anyone can pay you — even from
                      an exchange — and funds route automatically. Only needed once per wallet address.
                    </p>
                  </div>
                </div>

                {/* Switch to Base if needed */}
                {isConnected && !isOnBase && (
                  <button
                    onClick={() => switchChain({ chainId: baseChainId })}
                    disabled={isSwitching}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-600 transition-all active:scale-[0.98] disabled:opacity-70"
                  >
                    {isSwitching
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Switching…</>
                      : <><ArrowRight className="h-4 w-4" /> Switch to Base to activate</>}
                  </button>
                )}

                {/* Connect wallet if not connected */}
                {!isConnected && (
                  <div className="space-y-2">
                    <div className="flex justify-center">
                      <ConnectButton label="Connect Wallet to Activate" />
                    </div>
                    <p className="text-center text-[11px] text-gray-400">
                      or{' '}
                      <button
                        onClick={() => setVaultStep('skipped')}
                        className="underline underline-offset-2 hover:text-gray-600"
                      >
                        skip for now
                      </button>
                      {' '}— vault can be activated later
                    </p>
                  </div>
                )}

                {/* Deploy button — only if connected and on Base */}
                {isConnected && isOnBase && (
                  <button
                    onClick={handleDeployVault}
                    disabled={isDeploying}
                    className={cn(
                      'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition-all duration-200',
                      isDeploying
                        ? 'cursor-not-allowed bg-gray-100 text-gray-500'
                        : 'bg-black text-white shadow-button hover:bg-gray-800 hover:shadow-md active:scale-[0.98]',
                    )}
                  >
                    {isDeploying
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Activating vault…</>
                      : <><Zap className="h-4 w-4" /> Activate Payment Vault</>}
                  </button>
                )}

                {deployError && (
                  <p className="text-center text-xs text-red-500">{deployError}</p>
                )}

                {/* Skip option */}
                {isConnected && isOnBase && !isDeploying && (
                  <p className="text-center text-[11px] text-gray-400">
                    or{' '}
                    <button
                      onClick={() => setVaultStep('skipped')}
                      className="underline underline-offset-2 hover:text-gray-600"
                    >
                      skip for now
                    </button>
                    {' '}— wallet-connected payers will still work
                  </p>
                )}
              </div>
            )}

            {/* Vault ready */}
            {vaultReady && (
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Payment vault active</p>
                  <p className="text-[11px] text-emerald-700">Anyone can pay — even from an exchange. Funds route automatically.</p>
                </div>
              </div>
            )}

            {/* Vault skipped — if background check found the router is deployed, show as ready */}
            {vaultSkipped && routerDeployed === true && (
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Payment vault active</p>
                  <p className="text-[11px] text-emerald-700">Anyone can pay — even from an exchange. Funds route automatically.</p>
                </div>
              </div>
            )}
            {vaultSkipped && routerDeployed !== true && (
              <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div>
                  <p className="text-sm font-semibold text-slate-600">Vault not yet activated</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Wallet-connected payers work fine. Activate once for exchange/manual send support.
                  </p>
                  {evmValid && !isConnected && (
                    <div className="mt-2">
                      <ConnectButton label="Connect & Activate" />
                    </div>
                  )}
                  {evmValid && isConnected && (
                    <button
                      onClick={() => { setVaultStep('needs_deploy'); setDeployError(null) }}
                      className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-800 underline underline-offset-2"
                    >
                      Activate now →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Link panel (shown for all non-checking states) ── */}
            {(vaultReady || vaultSkipped || needsDeploy || isDeploying) && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                    <CheckCheck className="h-4 w-4 text-emerald-500" />
                    Link Ready
                  </p>
                  <button onClick={handleReset} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                    Start over
                  </button>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5">
                  <p className="min-w-0 flex-1 truncate font-mono text-xs text-gray-500">{generatedLink}</p>
                </div>

                {/* Preview */}
                <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Preview</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold text-gray-900">{formatAmount(amt, 18)}</span>
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
                    {copied ? <><CheckCheck className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy Link</>}
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
              { n: '1', title: 'Enter details',   body: 'Your EVM + Starknet addresses & amount' },
              { n: '2', title: 'Activate vault',   body: 'One-time on-chain setup · ~$0.01 gas' },
              { n: '3', title: 'Get paid',         body: 'Anyone pays from any wallet or exchange' },
            ].map(({ n, title, body }) => (
              <div key={n} className="rounded-xl border border-gray-100 bg-white p-4 text-center shadow-sm">
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
