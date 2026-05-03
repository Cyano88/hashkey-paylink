import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { LayoutOutletContext } from '../Layout'
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
  Mail,
  X,
  Download,
  ScanLine,
  LayoutDashboard,
  Globe,
  Sliders,
  DollarSign,
  RefreshCw,
} from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { FX_CURRENCIES, getFxMeta, formatLocalAmt, fetchFxRate } from '../lib/fx'
import { isAddress } from 'viem'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { cn, truncateAddress, formatAmount, copyToClipboard } from '../lib/utils'
import { useStarknet } from '../lib/StarknetContext'
import { useSolana }   from '../lib/SolanaContext'
import { CHAIN_META, type ChainKey } from '../lib/chains'
import { EVM_CLIENTS, ROUTER_FACTORY, FACTORY_GET_ROUTER_ABI, FACTORY_DEPLOY_ROUTER_ABI } from '../lib/router'

// ─── Starknet address: 0x followed by exactly 64 hex chars ──────────────────
const isValidStarkAddr = (v: string) => /^0x[0-9a-fA-F]{64}$/.test(v)

// ─── Solana address: base58, 32–44 characters ────────────────────────────────
const isValidSolanaAddr = (v: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)

const CHAINS: ChainKey[] = ['base', 'starknet', 'hashkey', 'arc', 'solana']

type VaultStep = 'idle' | 'checking' | 'needs_deploy' | 'deploying' | 'ready' | 'skipped'

export default function CreateLink() {
  const [evmAddr,       setEvmAddr]       = useState('')
  const [starkAddr,     setStarkAddr]     = useState('')
  const [solanaAddr,    setSolanaAddr]    = useState('')
  const [amt,           setAmt]           = useState('')
  const [memo,          setMemo]          = useState('')
  const [generatedLink, setGeneratedLink] = useState('')
  const [copied,        setCopied]        = useState(false)
  const [eventMode,      setEventMode]      = useState(false)
  const [eventId,        setEventId]        = useState('')
  const [multiChainMode, setMultiChainMode] = useState(false)
  const [flexAmount,     setFlexAmount]     = useState(false)
  const chainSwitchMounted = useRef(false)

  // ── FX Display settings (event mode only) ────────────────────────────────
  const [fxShow,        setFxShow]        = useState(false)
  const [fxCurrency,    setFxCurrency]    = useState('NGN')
  const [fxBuffer,      setFxBuffer]      = useState('0')
  const [fxSrc,         setFxSrc]         = useState<'live' | 'custom'>('live')
  const [fxCustomRate,  setFxCustomRate]  = useState('')
  const [fxPreviewRate, setFxPreviewRate] = useState<number | null>(null)
  const [fxPreviewLoad, setFxPreviewLoad] = useState(false)

  // Recover last multi-payer dashboard from localStorage
  type SavedEvent = { dashboardUrl: string; paymentUrl: string; eventName: string; ts: number }
  const [savedEvent, setSavedEvent] = useState<SavedEvent | null>(() => {
    try { return JSON.parse(localStorage.getItem('hp_last_event') ?? 'null') }
    catch { return null }
  })
  const qrRef       = useRef<HTMLDivElement>(null)
  const qrHiResRef  = useRef<HTMLDivElement>(null)
  // selectedNet is owned by Layout and shared via outlet context for bidirectional sync with the header toolkit
  const { selectedNet, onNetworkSelect } = useOutletContext<LayoutOutletContext>()
  // Derived early so useEffect hooks below can reference it without TDZ error
  const isEvmNet = selectedNet !== 'starknet' && selectedNet !== 'solana'
  const [vaultStep,     setVaultStep]     = useState<VaultStep>('idle')
  const [deployError,   setDeployError]   = useState<string | null>(null)
  // Background check — null=checking, true=deployed, false=not deployed
  const [routerDeployed, setRouterDeployed] = useState<boolean | null>(null)

  // ── Wallet hooks ──────────────────────────────────────────────────────────
  const { isConnected, address: connectedEvm } = useAccount()
  const { address: connectedStark }            = useStarknet()
  const { address: connectedSolana }           = useSolana()
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
    if (connectedEvm && evmAddr === '' && (isEvmNet || multiChainMode)) setEvmAddr(connectedEvm)
  }, [connectedEvm, isEvmNet, multiChainMode])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (connectedStark && starkAddr === '' && (selectedNet === 'starknet' || multiChainMode)) setStarkAddr(connectedStark)
  }, [connectedStark, selectedNet, multiChainMode])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (connectedSolana && solanaAddr === '' && (selectedNet === 'solana' || multiChainMode)) setSolanaAddr(connectedSolana)
  }, [connectedSolana, selectedNet, multiChainMode])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Wipe addresses on chain switch (single-chain mode only) ───────────────
  // Prevents address bleed-over when the organizer switches chains.
  useEffect(() => {
    if (!chainSwitchMounted.current) { chainSwitchMounted.current = true; return }
    if (multiChainMode) return
    setEvmAddr(''); setStarkAddr(''); setSolanaAddr('')
    setGeneratedLink(''); setVaultStep('idle')
  }, [selectedNet])  // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── FX preview rate ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!fxShow || !eventMode || !fxCurrency) { setFxPreviewRate(null); return }
    if (fxSrc === 'custom') {
      const v = parseFloat(fxCustomRate)
      setFxPreviewRate(v > 0 ? v : null)
      return
    }
    let cancelled = false
    setFxPreviewLoad(true)
    fetchFxRate(fxCurrency).then(d => {
      if (!cancelled && d.ok && d.rate) setFxPreviewRate(d.rate)
    }).catch(() => {}).finally(() => { if (!cancelled) setFxPreviewLoad(false) })
    return () => { cancelled = true }
  }, [fxShow, fxCurrency, eventMode, fxSrc, fxCustomRate])

  // ── Validation ─────────────────────────────────────────────────────────
  const evmDirty    = evmAddr.length > 0
  const starkDirty  = starkAddr.length > 0
  const solanaDirty = solanaAddr.length > 0
  const amtDirty    = amt.length > 0

  const evmValid    = isAddress(evmAddr)
  const starkValid  = isValidStarkAddr(starkAddr)
  const solanaValid = isValidSolanaAddr(solanaAddr)
  const isValidAmt  = amtDirty && parseFloat(amt) > 0 && !isNaN(parseFloat(amt))

  const hasAddress = multiChainMode
    ? (evmValid || starkValid || solanaValid)
    : (selectedNet === 'solana' ? solanaValid : isEvmNet ? evmValid : starkValid)

  const canGenerate = (flexAmount || isValidAmt) && hasAddress

  // ── Flexible amount toggle ─────────────────────────────────────────────────
  function toggleFlexAmount(on: boolean) {
    setFlexAmount(on)
    if (on) setAmt('')   // clear any typed amount — payer will enter it
    setGeneratedLink('')
    setVaultStep('idle')
  }

  // ── Multi-chain mode toggle ────────────────────────────────────────────────
  function toggleMultiChainMode(on: boolean) {
    setMultiChainMode(on)
    setGeneratedLink('')
    setVaultStep('idle')
  }

  // ── Event mode toggle ──────────────────────────────────────────────────────
  function toggleEventMode(on: boolean) {
    setEventMode(on)
    if (on && !eventId) {
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      setEventId(Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''))
    }
    setGeneratedLink('')
    setVaultStep('idle')  // restore Generate button when toggling after a previous generate
  }

  // ── QR download — uses hidden 1024px canvas for UHD output ────────────────
  function downloadQR() {
    const canvas = qrHiResRef.current?.querySelector('canvas')
    if (!canvas) return
    const out  = document.createElement('canvas')
    out.width  = canvas.width
    out.height = canvas.height
    const ctx  = out.getContext('2d')!
    ctx.drawImage(canvas, 0, 0)
    const logo  = new Image()
    logo.onload = () => {
      const size    = Math.round(canvas.width * 0.15)
      const x       = Math.round((canvas.width  - size) / 2)
      const y       = Math.round((canvas.height - size) / 2)
      const pad     = 10
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x - pad, y - pad, size + pad * 2, size + pad * 2)
      ctx.drawImage(logo, x, y, size, size)
      const a    = document.createElement('a')
      a.href     = out.toDataURL('image/png')
      a.download = `${(memo.trim() || 'payment-link').replace(/\s+/g, '-')}-qr.png`
      a.click()
    }
    logo.src = '/hash-logo.png'
  }

  // ── Build link URL ─────────────────────────────────────────────────────
  function buildLink() {
    if (multiChainMode) {
      const params = new URLSearchParams({ multi: '1' })
      if (!flexAmount) params.set('amt', amt); else params.set('flex', '1')
      if (evmValid)    params.set('evm', evmAddr)
      if (starkValid)  params.set('stark', starkAddr)
      if (solanaValid) params.set('sol', solanaAddr)
      if (memo.trim()) params.set('memo', memo.trim())
      if (eventMode && eventId) {
        params.set('event', '1'); params.set('id', eventId)
        if (fxShow && fxCurrency) {
          params.set('fx', fxCurrency); params.set('fxshow', '1')
          if (parseFloat(fxBuffer) > 0) params.set('fxbuf', fxBuffer)
          if (fxSrc === 'custom' && parseFloat(fxCustomRate) > 0) {
            params.set('fxsrc', 'custom'); params.set('fxrate', fxCustomRate)
          }
        }
      }
      return `${window.location.origin}/pay?${params.toString()}`
    }
    const params = new URLSearchParams({ net: selectedNet })
    if (!flexAmount) params.set('amt', amt); else params.set('flex', '1')
    if (selectedNet === 'solana')  params.set('sol', solanaAddr)
    else if (isEvmNet)             params.set('evm', evmAddr)
    else                           params.set('stark', starkAddr)
    if (memo.trim()) params.set('memo', memo.trim())
    if (eventMode && eventId) {
      params.set('event', '1'); params.set('id', eventId)
      if (fxShow && fxCurrency) {
        params.set('fx', fxCurrency); params.set('fxshow', '1')
        if (parseFloat(fxBuffer) > 0) params.set('fxbuf', fxBuffer)
      }
    }
    return `${window.location.origin}/pay?${params.toString()}`
  }

  function buildDashboardLink() {
    const params = new URLSearchParams({ id: eventId })
    if (!flexAmount) params.set('amt', amt)
    else             params.set('flex', '1')
    if (multiChainMode) {
      params.set('multi', '1')
      if (evmValid)    params.set('evm', evmAddr)
      if (starkValid)  params.set('stark', starkAddr)
      if (solanaValid) params.set('sol', solanaAddr)
    } else {
      params.set('net', selectedNet)
      if (selectedNet === 'solana') params.set('sol', solanaAddr)
      else                          params.set('evm', evmAddr)
    }
    if (memo.trim()) params.set('name', memo.trim())
    if (fxShow && fxCurrency) {
      params.set('fx', fxCurrency); params.set('fxshow', '1')
      if (parseFloat(fxBuffer) > 0) params.set('fxbuf', fxBuffer)
    }
    return `${window.location.origin}/event?${params.toString()}`
  }

  // ── Generate handler ───────────────────────────────────────────────────
  function handleGenerate() {
    if (!canGenerate) return
    const link = buildLink()
    setGeneratedLink(link)
    setVaultStep('ready')
    if (eventMode && eventId) {
      const entry: SavedEvent = {
        dashboardUrl: buildDashboardLink(),
        paymentUrl:   link,
        eventName:    memo.trim() || 'My Event',
        ts:           Date.now(),
      }
      localStorage.setItem('hp_last_event', JSON.stringify(entry))
      setSavedEvent(entry)
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
    setEvmAddr(''); setStarkAddr(''); setSolanaAddr(''); setAmt(''); setMemo('')
    setGeneratedLink(''); setCopied(false); setMultiChainMode(false); setFlexAmount(false)
    setVaultStep('idle'); setDeployError(null); setRouterDeployed(null); resetDeploy()
  }

  const linkReady = generatedLink !== ''

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

        {/* ── Chain preview toggle — hidden in multi-chain mode (all chains active) */}
        {!multiChainMode && <div className="mt-5 flex flex-col items-center gap-2.5">
          <div className="flex items-center justify-center gap-0.5 sm:gap-1 rounded-xl border border-gray-200 bg-gray-100/80 p-1 overflow-x-auto w-full sm:w-auto sm:inline-flex">
            {CHAINS.map((c) => {
              const m = CHAIN_META[c]
              const isActive = selectedNet === c
              return (
                <button
                  key={c}
                  onClick={() => onNetworkSelect(c)}
                  className={cn(
                    'flex shrink-0 items-center gap-1 sm:gap-1.5 rounded-lg px-1.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-semibold transition-all duration-150',
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
            const m = CHAIN_META[selectedNet]
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
        </div>}

        {/* Multi-chain mode active badge */}
        {multiChainMode && (
          <div className="mt-5 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold text-violet-700">
              <Globe className="h-3 w-3" />
              Multi-Chain · All networks active
            </span>
          </div>
        )}
      </div>

      {/* ── Form card ─────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">
        <div className="space-y-5 p-6 sm:p-8">

          {/* ── EVM Address — Base / HashKey / Arc ───────────────────── */}
          {(isEvmNet || multiChainMode) && <fieldset className="space-y-1.5">
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
              </p>
            )}
          </fieldset>}

          {/* ── Starknet Address — Starknet only ─────────────────────── */}
          {(selectedNet === 'starknet' || multiChainMode) && <fieldset className="space-y-1.5">
            <label className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <span className="h-2 w-2 rounded-full bg-[#8B5CF6]" />
                Starknet Address
              </span>
              <span className="text-[11px] font-medium text-gray-400">Starknet Mainnet · WalletConnect</span>
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
          </fieldset>}

          {/* ── Solana Address — Solana only ──────────────────────────── */}
          {(selectedNet === 'solana' || multiChainMode) && <fieldset className="space-y-1.5">
            <label className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <span className="h-2 w-2 rounded-full bg-[#14F195]" />
                Solana Address
              </span>
              <span className="text-[11px] font-medium text-gray-400">Solana Mainnet · USDC</span>
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Base58 Solana address (32–44 chars)"
                value={solanaAddr}
                onChange={(e) => { setSolanaAddr(e.target.value.trim()); setGeneratedLink('') }}
                spellCheck={false}
                autoComplete="off"
                className={cn(
                  'w-full rounded-xl border bg-gray-50/60 px-4 py-3 font-mono text-sm',
                  'placeholder:text-gray-400 transition-all focus:bg-white focus:outline-none focus:ring-2',
                  solanaDirty && !solanaValid
                    ? 'border-red-300 pr-10 text-red-600 focus:ring-red-100'
                    : solanaValid
                    ? 'border-emerald-300 text-gray-900 focus:ring-emerald-100'
                    : 'border-gray-200 text-gray-900 focus:border-[#14F195]/40 focus:ring-[#14F195]/15',
                )}
              />
              {solanaDirty && !solanaValid && (
                <XCircle className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-400" />
              )}
            </div>
            {solanaDirty && !solanaValid && (
              <p className="flex items-center gap-1 text-xs text-red-500">
                <Info className="h-3 w-3" /> Must be a valid Solana base58 address.
              </p>
            )}
            {solanaValid && (
              <p className="flex items-center gap-1 text-xs text-emerald-600">
                <CheckCheck className="h-3 w-3" />
                {connectedSolana && solanaAddr === connectedSolana
                  ? `Auto-filled · ${truncateAddress(solanaAddr, 8)}`
                  : truncateAddress(solanaAddr, 8)}
              </p>
            )}
          </fieldset>}

          {/* ── Amount ───────────────────────────────────────────────── */}
          {flexAmount && (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-violet-200 bg-violet-50/40 px-4 py-3">
              <Sliders className="h-4 w-4 shrink-0 text-violet-400" />
              <div>
                <p className="text-xs font-semibold text-violet-600">Flexible Amount enabled</p>
                <p className="text-[11px] text-violet-400 mt-0.5">Payer enters the amount at checkout</p>
              </div>
            </div>
          )}
          {!flexAmount && <fieldset className="space-y-1.5">
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
          </fieldset>}

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

          {/* ── Multi-payer Collection toggle ────────────────────────── */}
          <button
            type="button"
            onClick={() => toggleEventMode(!eventMode)}
            className={cn(
              'w-full rounded-xl border-2 p-4 text-left transition-all',
              eventMode
                ? 'border-blue-400 bg-blue-50/60'
                : 'border-gray-200 bg-white hover:border-gray-300',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScanLine className={cn('h-4 w-4', eventMode ? 'text-blue-500' : 'text-gray-400')} />
                <span className="text-sm font-semibold text-gray-800">Multi-payer Collection</span>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">Beta</span>
              </div>
              {/* Toggle pill */}
              <div className={cn('relative h-5 w-9 rounded-full transition-colors', eventMode ? 'bg-blue-500' : 'bg-gray-300')}>
                <div className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                  eventMode ? 'translate-x-4' : 'translate-x-0.5',
                )} />
              </div>
            </div>
            <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
              Each payer enters their name before paying. Tracked in a live dashboard with Export CSV.
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              Suitable for: <span className="font-medium text-gray-500">online donations · group splits · classroom fees · dues · registrations · and more</span>
            </p>
          </button>

          {/* ── FX Display Settings (only when event mode is ON) ─────── */}
          {eventMode && (
            <div className={cn(
              'rounded-xl border p-4 space-y-3 transition-all',
              fxShow ? 'border-blue-200 bg-blue-50/30 dark:border-blue-900/40 dark:bg-blue-950/20' : 'border-gray-200 bg-gray-50/50',
            )}>
              {/* Header row with toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className={cn('h-3.5 w-3.5', fxShow ? 'text-blue-400' : 'text-gray-400')} />
                  <span className="text-sm font-medium text-gray-700">Local Currency Display</span>
                  <span className="text-[10px] text-gray-400 font-normal">— optional</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFxShow(v => !v)}
                  className="shrink-0"
                >
                  <div className={cn('relative h-5 w-9 rounded-full transition-colors', fxShow ? 'bg-blue-500' : 'bg-gray-300')}>
                    <div className={cn(
                      'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                      fxShow ? 'translate-x-4' : 'translate-x-0.5',
                    )} />
                  </div>
                </button>
              </div>

              {/* Settings — only when toggled on */}
              {fxShow && (
                <div className="space-y-2.5 pt-0.5">
                  {/* Currency picker */}
                  <div className="flex items-center gap-3">
                    <label className="w-16 shrink-0 text-[11px] text-gray-500">Currency</label>
                    <select
                      value={fxCurrency}
                      onChange={e => { setFxCurrency(e.target.value); setFxPreviewRate(null) }}
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-100"
                    >
                      {FX_CURRENCIES.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.symbol} {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Rate source toggle */}
                  <div className="flex items-center gap-3">
                    <label className="w-16 shrink-0 text-[11px] text-gray-500">Rate</label>
                    <div className="flex flex-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => setFxSrc('live')}
                        className={cn(
                          'flex-1 rounded-md px-3 py-1.5 transition-all',
                          fxSrc === 'live' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                        )}
                      >Live (Fixer.io)</button>
                      <button
                        type="button"
                        onClick={() => setFxSrc('custom')}
                        className={cn(
                          'flex-1 rounded-md px-3 py-1.5 transition-all',
                          fxSrc === 'custom' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                        )}
                      >Custom / Street</button>
                    </div>
                  </div>

                  {/* Custom rate input */}
                  {fxSrc === 'custom' && (
                    <div className="flex items-center gap-3">
                      <label className="w-16 shrink-0 text-[11px] text-gray-500">1 USDC =</label>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          placeholder={`e.g. 1780`}
                          value={fxCustomRate}
                          onChange={e => setFxCustomRate(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 pr-14 text-sm text-gray-700 placeholder:text-gray-300 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-100"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-gray-400">
                          {fxCurrency}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Buffer picker */}
                  <div className="flex items-center gap-3">
                    <label className="w-16 shrink-0 text-[11px] text-gray-500">Buffer</label>
                    <select
                      value={fxBuffer}
                      onChange={e => setFxBuffer(e.target.value)}
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-100"
                    >
                      {['0', '0.5', '1', '1.5', '2', '3', '5'].map(v => (
                        <option key={v} value={v}>
                          {v === '0' ? 'No buffer' : `+${v}% volatility coverage`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Live preview */}
                  <div className="flex items-center justify-center gap-1.5 pt-0.5">
                    {fxPreviewLoad ? (
                      <RefreshCw className="h-3 w-3 animate-spin text-gray-300" />
                    ) : fxPreviewRate ? (() => {
                        const adj = fxPreviewRate * (1 + parseFloat(fxBuffer) / 100)
                        const decimals = getFxMeta(fxCurrency)?.decimals ?? 2
                        return (
                          <p className="text-[11px] text-gray-400 text-center">
                            {fxSrc === 'custom' ? '📌 Custom rate:' : 'Live rate:'}{' '}
                            1 USDC = {adj.toFixed(decimals > 0 ? 2 : 0)} {fxCurrency}
                            {isValidAmt && ` · ≈ ${formatLocalAmt(parseFloat(amt), adj, decimals)} ${fxCurrency} for ${amt} USDC`}
                          </p>
                        )
                      })() : fxSrc === 'custom' && !fxCustomRate ? (
                      <p className="text-[11px] text-gray-400">Enter your street / parallel market rate above</p>
                    ) : null}
                  </div>
                  <p className="text-[10px] text-gray-400 text-center leading-relaxed">
                    {fxSrc === 'custom'
                      ? `Custom rate is baked into the link — update the link if the rate shifts significantly.`
                      : `Live rate fetched from Fixer.io, cached 10 min. Buffer covers movement between scan and settlement.`}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Multi-Chain Payment toggle ───────────────────────────── */}
          <button
            type="button"
            onClick={() => toggleMultiChainMode(!multiChainMode)}
            className={cn(
              'w-full rounded-xl border-2 p-4 text-left transition-all',
              multiChainMode
                ? 'border-violet-400 bg-violet-50/60'
                : 'border-gray-200 bg-white hover:border-gray-300',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className={cn('h-4 w-4', multiChainMode ? 'text-violet-500' : 'text-gray-400')} />
                <span className="text-sm font-semibold text-gray-800">Multi-Chain Payment</span>
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">New</span>
              </div>
              <div className={cn('relative h-5 w-9 rounded-full transition-colors', multiChainMode ? 'bg-violet-500' : 'bg-gray-300')}>
                <div className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                  multiChainMode ? 'translate-x-4' : 'translate-x-0.5',
                )} />
              </div>
            </div>
            <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
              Fill addresses for multiple chains. Payer chooses which chain to pay from — one payment, any chain.
            </p>
          </button>

          {/* ── Flexible Amount toggle ───────────────────────────────── */}
          <button
            type="button"
            onClick={() => toggleFlexAmount(!flexAmount)}
            className={cn(
              'w-full rounded-xl border-2 p-4 text-left transition-all',
              flexAmount
                ? 'border-violet-400 bg-violet-50/60'
                : 'border-gray-200 bg-white hover:border-gray-300',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className={cn('h-4 w-4', flexAmount ? 'text-violet-500' : 'text-gray-400')} />
                <span className="text-sm font-semibold text-gray-800">Flexible Amount</span>
              </div>
              <div className={cn('relative h-5 w-9 rounded-full transition-colors', flexAmount ? 'bg-violet-500' : 'bg-gray-300')}>
                <div className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                  flexAmount ? 'translate-x-4' : 'translate-x-0.5',
                )} />
              </div>
            </div>
            <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
              No fixed price — payer enters the amount and what they're paying for at checkout.
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              Suitable for: <span className="font-medium text-gray-500">restaurants · shops · invoices · tips · donations</span>
            </p>
          </button>

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

          {!canGenerate && vaultStep === 'idle' && (
            multiChainMode
              ? (!evmDirty && !starkDirty && !solanaDirty)
              : (selectedNet === 'solana' ? !solanaDirty : isEvmNet ? !evmDirty : !starkDirty)
          ) && (
            <p className="text-center text-xs text-gray-400">
              {multiChainMode
                ? 'Enter at least one wallet address to continue'
                : `Enter a ${selectedNet === 'solana' ? 'Solana' : isEvmNet ? 'wallet' : 'Starknet'} address to continue`}
            </p>
          )}
        </div>

        {/* ── Link ready panel ─────────────────────────────────────────── */}
        {linkReady && (
          <div className="animate-slide-up border-t border-gray-100 bg-gradient-to-b from-gray-50/80 to-white p-6 sm:px-8 space-y-4">
            <div className="space-y-3">
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
                  {flexAmount
                    ? <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-700"><Sliders className="h-3.5 w-3.5" />Flexible</span>
                    : <><span className="text-2xl font-bold text-gray-900">{formatAmount(amt, 18)}</span><span className="text-sm font-medium text-gray-500">USDC · HSK</span></>
                  }
                </div>
                <div className="space-y-1">
                  {evmValid && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="flex gap-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0052FF]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-[#C9A227]" />
                      </span>
                      <span>{multiChainMode ? 'Base · HashKey · Arc' : CHAIN_META[selectedNet].label}:</span>
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
                  {solanaValid && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#14F195]" />
                      <span>Solana:</span>
                      <span className="font-mono text-gray-700">{truncateAddress(solanaAddr, 8)}</span>
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

              {/* Hidden 1024px canvas used only for UHD PNG download */}
              <div ref={qrHiResRef} aria-hidden="true"
                style={{ position: 'absolute', left: '-9999px', visibility: 'hidden' }}>
                <QRCodeCanvas value={generatedLink} size={1024} level="H" includeMargin />
              </div>

              {/* ── QR Code (all links) ──────────────────────────────── */}
              <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">QR Code</p>
                <div className="flex items-center gap-4">
                  <div ref={qrRef} className="relative rounded-xl bg-white p-2 shadow-sm border border-gray-100 shrink-0">
                    <QRCodeCanvas value={generatedLink} size={180} level="H" includeMargin />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="rounded-sm bg-white p-0.5">
                        <img src="/hash-logo.png" alt="" className="h-6 w-6 object-contain" />
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2">
                    <button
                      onClick={downloadQR}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-all active:scale-[0.98]"
                    >
                      <Download className="h-3.5 w-3.5" /> Download QR (PNG)
                    </button>

                    {/* Dashboard link — event mode only */}
                    {eventMode && (
                      <a
                        href={buildDashboardLink()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-all active:scale-[0.98]"
                      >
                        <LayoutDashboard className="h-3.5 w-3.5" /> Open Organizer Dashboard
                      </a>
                    )}
                  </div>
                </div>
                {eventMode && (
                  <p className="text-[11px] text-blue-600">
                    Each payer must enter their name before paying — their entry will appear live in the dashboard.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Last event dashboard recovery ────────────────────────────── */}
      {!generatedLink && savedEvent && (
        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-blue-700">Last Multi-payer Collection</p>
              <p className="text-[11px] text-blue-500 mt-0.5">
                {savedEvent.eventName} · {new Date(savedEvent.ts).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={() => { localStorage.removeItem('hp_last_event'); setSavedEvent(null) }}
              className="text-[11px] text-blue-400 hover:text-blue-600 transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="flex gap-2">
            <a
              href={savedEvent.dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-all active:scale-[0.98]"
            >
              Open Dashboard
            </a>
            <button
              onClick={() => copyToClipboard(savedEvent.paymentUrl)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 transition-all active:scale-[0.98]"
            >
              Copy Payment Link
            </button>
          </div>
        </div>
      )}

      {/* ── How it works ─────────────────────────────────────────────── */}
      {!generatedLink && (
        <div className="mt-10 animate-fade-in">
          <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            How it works
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { n: '1', title: 'Enter details',   body: 'Your EVM or Starknet wallet address' },
              { n: '2', title: 'Enter amount',    body: 'USDC or HSK' },
              { n: '3', title: 'Get paid',        body: 'Anyone pays from any wallet or exchange' },
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

          {/* ── Footer links ─────────────────────────────────────────── */}
          <div className="mt-6 border-t border-gray-100 pt-5 flex items-center justify-center gap-8">
            <a
              href="mailto:support@hashpaylink.com"
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-900 transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />
              support@hashpaylink.com
            </a>
            <a
              href="https://x.com/Hash_PayLink"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-900 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              @Hash_PayLink
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
