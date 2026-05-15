import { useEffect, useState } from 'react'
import {
  useAccount, useChainId, useSwitchChain,
  useReadContract, useWriteContract, usePublicClient,
} from 'wagmi'
import { isAddress, parseAbi, parseEventLogs } from 'viem'
import { Mail, RefreshCw, X as XIcon } from 'lucide-react'
import { STREAM_VAULT_FACTORY_ABI } from '../lib/streamVaultAbi'
import { formatUsdcFull } from './TriStateBar'
import {
  canUseCircleEvmEmailWallet,
  connectCircleEvmEmailWallet,
  sendCircleArcStream,
  type CircleEvmEmailSession,
} from '../../../../src/lib/circleEvmEmailWallet'

const ARC_CHAIN_ID = 5042002
const ARC_USDC     = '0x3600000000000000000000000000000000000000' as const
const ARC_EXPLORER = 'https://testnet.arcscan.app'

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
])

const DURATIONS = [
  { label: '1 hr',    secs: 3_600n },
  { label: '8 hrs',   secs: 28_800n },
  { label: '24 hrs',  secs: 86_400n },
  { label: '7 days',  secs: 604_800n },
  { label: '30 days', secs: 2_592_000n },
]

type Step = 'form' | 'funding' | 'creating' | 'success'

function readPrefill() {
  const params = new URLSearchParams(window.location.search)
  const rawDuration = (params.get('duration') ?? '').trim().toLowerCase()
  const amount = (params.get('amount') ?? '').trim()
  const recipient = (params.get('recipient') ?? '').trim()
  const reason = (params.get('reason') ?? '').trim()
  const source = (params.get('src') ?? '').trim().toLowerCase()
  const wallet = (params.get('wallet') ?? params.get('mode') ?? '').trim().toLowerCase()
  const preferCircle = source === 'telegram' || wallet === 'circle' || wallet === 'smart'
  let durationPreset: bigint | null = null
  let customDays = ''

  const match = rawDuration.match(/^(\d+)([dhw])$/)
  if (match) {
    const value = BigInt(match[1])
    const unit = match[2]
    const seconds = unit === 'h'
      ? value * 3_600n
      : unit === 'w'
        ? value * 7n * 86_400n
        : value * 86_400n
    durationPreset = DURATIONS.find(item => item.secs === seconds)?.secs ?? null
    if (!durationPreset) customDays = (Number(seconds) / 86_400).toString()
  }

  return { amount, recipient, reason, durationPreset, customDays, preferCircle }
}

function parseUsdc(val: string): bigint {
  const n = parseFloat(val)
  if (!isFinite(n) || n <= 0) return 0n
  return BigInt(Math.round(n * 1_000_000))
}

function formatWalletUsdc(value: bigint) {
  if (value === 0n) return '0'
  const full = formatUsdcFull(value)
  return full.includes('.') ? full.replace(/\.?0+$/, '') : full
}

function genSalt(): `0x${string}` {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return `0x${[...arr].map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function buildStreamLink(vault: `0x${string}`, reason: string, circleMode = false): string {
  const { hostname, origin } = window.location
  const isDedicatedHost =
    hostname === 'streampay.xyz' ||
    hostname.endsWith('.streampay.xyz') ||
    hostname.includes('streampay')
  const p = new URLSearchParams()
  if (!isDedicatedHost) p.set('app', 'streampay')
  if (circleMode) {
    p.set('src', 'telegram')
    p.set('wallet', 'circle')
  }
  if (reason.trim())    p.set('reason', reason.trim())
  const qs = p.toString()
  return `${origin}/stream/${vault}${qs ? `?${qs}` : ''}`
}

export function CreateStreamForm() {
  const [prefill] = useState(readPrefill)
  const { address: connectedAddr, isConnected } = useAccount()
  const chainId                = useChainId()
  const { switchChain }        = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient           = usePublicClient({ chainId: ARC_CHAIN_ID })

  const isOnArc     = chainId === ARC_CHAIN_ID
  const factoryAddr = (import.meta.env.VITE_STREAM_FACTORY_ADDRESS ?? '') as `0x${string}`

  const [recipient,      setRecipient]      = useState(prefill.recipient)
  const [amount,         setAmount]         = useState(prefill.amount)
  const [durationPreset, setDurationPreset] = useState<bigint | null>(prefill.durationPreset)
  const [customDays,     setCustomDays]     = useState(prefill.customDays)
  const [reason,         setReason]         = useState(prefill.reason)
  const [salt] = useState<`0x${string}`>(genSalt)

  const [step,         setStep]         = useState<Step>('form')
  const [statusMsg,    setStatusMsg]    = useState('')
  const [error,        setError]        = useState<string | null>(null)
  const [streamLink,   setStreamLink]   = useState<string | null>(null)
  const [deployTxHash, setDeployTxHash] = useState<string | null>(null)
  const [copied,       setCopied]       = useState(false)
  const [circleEmail,      setCircleEmail]      = useState('')
  const [circleSession,    setCircleSession]    = useState<CircleEvmEmailSession | null>(null)
  const [circleBalance,    setCircleBalance]    = useState<bigint | null>(null)
  const [circleBalanceRefreshing, setCircleBalanceRefreshing] = useState(false)
  const [circleCopied,     setCircleCopied]     = useState(false)

  const recipientValid = isAddress(recipient)
  const amountBn       = parseUsdc(amount)
  const amountValid    = amountBn > 0n
  const durationSecs   = durationPreset
    ?? (customDays ? BigInt(Math.round(parseFloat(customDays) * 86400)) : 0n)
  const durationValid  = durationSecs > 0n
  const isFormValid    = recipientValid && amountValid && durationValid
                         && isConnected && isOnArc && !!factoryAddr
  const circleConfigured = canUseCircleEvmEmailWallet('arc')
  const circleAvailable = prefill.preferCircle
  const circleReady = recipientValid && amountValid && durationValid && !!factoryAddr
  const circleNeedsFunds = circleBalance !== null && amountValid && circleBalance < amountBn

  const { data: usdcBalance } = useReadContract({
    address:      ARC_USDC,
    abi:          ERC20_ABI,
    functionName: 'balanceOf',
    args:         [connectedAddr ?? '0x0000000000000000000000000000000000000000'],
    query:        { enabled: !!connectedAddr && isOnArc, refetchInterval: 10_000 },
  })
  const insufficientFunds = usdcBalance !== undefined && amountValid && usdcBalance < amountBn

  const isWorking   = step === 'funding' || step === 'creating'
  const deployReady = isFormValid && !isWorking && !insufficientFunds
  const circleDeployReady = circleAvailable && circleConfigured && circleReady && !isWorking && !circleNeedsFunds

  async function refreshCircleBalance(walletAddress = circleSession?.wallet.address) {
    if (!walletAddress || !publicClient) return null
    setCircleBalanceRefreshing(true)
    try {
      const balance = await publicClient.readContract({
        address: ARC_USDC,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [walletAddress],
      }) as bigint
      setCircleBalance(balance)
      return balance
    } finally {
      setCircleBalanceRefreshing(false)
    }
  }

  async function waitForPredictedVault(vaultAddress: `0x${string}`) {
    if (!publicClient) return false
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      const bytecode = await publicClient.getBytecode({ address: vaultAddress }).catch(() => undefined)
      if (bytecode && bytecode !== '0x') return true
      await sleep(2_500)
    }
    return false
  }

  useEffect(() => {
    if (!circleSession?.wallet.address || !publicClient || isWorking) return
    const walletAddress = circleSession.wallet.address
    const first = window.setTimeout(() => {
      void refreshCircleBalance(walletAddress)
    }, 2_000)
    const interval = window.setInterval(() => {
      void refreshCircleBalance(walletAddress)
    }, 8_000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(interval)
    }
  }, [circleSession?.wallet.address, publicClient, isWorking])

  async function handleDeploy() {
    if (!deployReady || !connectedAddr || !publicClient) return
    setError(null)
    const startTime = BigInt(Math.floor(Date.now() / 1000) + 120)
    const endTime   = startTime + durationSecs
    try {
      const predicted = await publicClient.readContract({
        address: factoryAddr, abi: STREAM_VAULT_FACTORY_ABI,
        functionName: 'getVaultAddress',
        args: [connectedAddr, recipient as `0x${string}`, amountBn, startTime, endTime, salt],
      }) as `0x${string}`

      setStep('funding'); setStatusMsg('Sign to fund vault…')
      const fundTx = await writeContractAsync({
        address: ARC_USDC, abi: ERC20_ABI,
        functionName: 'transfer', args: [predicted, amountBn], gas: 100_000n,
      })
      setStatusMsg('Confirming on Arc…')
      await publicClient.waitForTransactionReceipt({ hash: fundTx })

      setStep('creating'); setStatusMsg('Sign to deploy vault…')
      const deployTx = await writeContractAsync({
        address: factoryAddr, abi: STREAM_VAULT_FACTORY_ABI,
        functionName: 'createStream',
        args: [recipient as `0x${string}`, amountBn, startTime, endTime, salt],
        gas: 2_000_000n,
      })
      setDeployTxHash(deployTx); setStatusMsg('Deploying on Arc…')
      const receipt = await publicClient.waitForTransactionReceipt({ hash: deployTx })

      const logs  = parseEventLogs({ abi: STREAM_VAULT_FACTORY_ABI, logs: receipt.logs })
      const event = logs.find(l => l.eventName === 'StreamCreated')
      const vault = (event?.args as { vault?: `0x${string}` })?.vault
      if (!vault) throw new Error('Could not extract vault address from receipt.')

      setStreamLink(buildStreamLink(vault, reason))
      setStep('success'); setStatusMsg('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied')) {
        setStep('form'); setStatusMsg(''); return
      }
      setError(msg.slice(0, 180)); setStep('form')
    }
  }

  async function handleCircleDeploy() {
    if (!circleDeployReady || !publicClient) return
    const email = circleEmail.trim()
    if (!email && !circleSession) {
      setError('Enter your email to continue with Circle Smart Wallet.')
      return
    }

    setError(null)
    const startTime = BigInt(Math.floor(Date.now() / 1000) + 120)
    const endTime   = startTime + durationSecs
    try {
      setStep('funding')
      setStatusMsg(circleSession ? 'Preparing Circle Smart Wallet...' : 'Opening Circle Smart Wallet...')
      const session = circleSession ?? await connectCircleEvmEmailWallet(email, 'arc')
      setCircleSession(session)

      const balance = await refreshCircleBalance(session.wallet.address)
      if (balance !== null && balance < amountBn) {
        setStep('form')
        setStatusMsg('')
        return
      }

      const predicted = await publicClient.readContract({
        address: factoryAddr, abi: STREAM_VAULT_FACTORY_ABI,
        functionName: 'getVaultAddress',
        args: [session.wallet.address, recipient as `0x${string}`, amountBn, startTime, endTime, salt],
      }) as `0x${string}`

      setStep('creating')
      setStatusMsg('Confirm stream in Circle Smart Wallet...')
      const txHash = await sendCircleArcStream({
        session,
        factoryAddress: factoryAddr,
        recipient: recipient as `0x${string}`,
        amountUnits: amountBn.toString(),
        startTime: startTime.toString(),
        endTime: endTime.toString(),
        salt,
        predictedVault: predicted,
      })
      if (!txHash) {
        setStatusMsg('Waiting for Arc stream confirmation...')
        const deployed = await waitForPredictedVault(predicted)
        if (!deployed) {
          throw new Error('Circle submitted the stream, but Arc confirmation is still pending. Refresh this page in a minute and check the stream link again.')
        }
        setStreamLink(buildStreamLink(predicted, reason, true))
        void refreshCircleBalance(session.wallet.address)
        setStep('success')
        setStatusMsg('')
        return
      }

      setDeployTxHash(txHash)
      setStatusMsg('Deploying on Arc...')
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      const logs  = parseEventLogs({ abi: STREAM_VAULT_FACTORY_ABI, logs: receipt.logs })
      const event = logs.find(l => l.eventName === 'StreamCreated')
      const vault = (event?.args as { vault?: `0x${string}` })?.vault
      if (!vault) throw new Error('Could not extract vault address from receipt.')

      setStreamLink(buildStreamLink(vault, reason, true))
      void refreshCircleBalance(session.wallet.address)
      setStep('success')
      setStatusMsg('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied')) {
        setStep('form'); setStatusMsg(''); return
      }
      setError(msg.slice(0, 180))
      setStep('form')
      setStatusMsg('')
    }
  }

  function handleCopy() {
    if (!streamLink) return
    navigator.clipboard.writeText(streamLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  async function handleCopyCircleWallet() {
    if (!circleSession?.wallet.address) return
    await navigator.clipboard.writeText(circleSession.wallet.address)
    setCircleCopied(true)
    setTimeout(() => setCircleCopied(false), 3000)
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (step === 'success' && streamLink) {
    return (
      <div className="w-full max-w-[480px] mx-auto mt-12">
        <div className="space-y-6">

          {/* Page title */}
          <div className="text-center space-y-1.5">
            <h1 className="text-[26px] sm:text-[30px] font-bold tracking-tight text-gray-900">
              Pay<span style={{ color: '#3b82f6' }}>roll</span>
            </h1>
            <p className="text-[13px] text-gray-400">Stream payment in USDC to anyone on Arc</p>
          </div>

          {/* Success card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-7 sm:px-7 sm:py-8 text-center space-y-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-50 border border-gray-200">
              <svg className="h-6 w-6 text-gray-700" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>

            <div className="space-y-1.5">
              <p className="text-[17px] font-bold text-gray-900">Stream Deployed</p>
              {reason && (
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{reason}</p>
              )}
              <p className="text-[13px] text-gray-500">
                {formatUsdcFull(amountBn)} USDC streaming to{' '}
                <span className="font-mono font-semibold text-gray-700">
                  {recipient.slice(0, 6)}…{recipient.slice(-4)}
                </span>
              </p>
            </div>

            <div className="rounded-xl bg-gray-50 border-2 border-gray-200 p-4 text-left space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Share Stream Link</p>
              <p className="break-all font-mono text-[11px] leading-relaxed text-gray-500">{streamLink}</p>
              <div className="space-y-2">
                <button
                  onClick={handleCopy}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold transition-all min-h-[48px]"
                  style={copied
                    ? { background: '#f9fafb', color: '#374151', border: '2px solid #e5e7eb' }
                    : { background: '#111827', color: '#ffffff', border: '2px solid #111827' }}
                >
                  {copied
                    ? <><CheckIcon />LINK COPIED</>
                    : 'Copy Link'}
                </button>
                <a
                  href={streamLink}
                  className="w-full flex items-center justify-center rounded-xl py-3 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 min-h-[48px]"
                  style={{ border: '2px solid #e5e7eb' }}
                >
                  View Stream
                </a>
              </div>
            </div>

            {deployTxHash && (
              <a
                href={`${ARC_EXPLORER}/tx/${deployTxHash}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                <ExtLinkIcon />
                View on Arcscan
              </a>
            )}

            <HashPayLinkBadge />
          </div>
        </div>
      </div>
    )
  }

  // ── Status hint ───────────────────────────────────────────────────────────
  const hint = (() => {
    if (isWorking) return step === 'funding' ? 'Step 1 of 2 — funding vault' : 'Step 2 of 2 — deploying stream'
    if (circleAvailable) return 'Circle Smart Wallet signs and deploys the Arc stream from Telegram'
    if (!isConnected) return 'Connect your wallet in the header above to continue'
    if (!isOnArc) return null
    if (insufficientFunds) return null
    if (!recipientValid && recipient) return null
    if (!recipientValid) return 'Enter a recipient address to continue'
    if (!amountValid) return 'Enter an amount to continue'
    if (!durationValid) return 'Select a stream duration to continue'
    return '2 wallet signatures required — fund vault, then deploy'
  })()

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-[480px] mx-auto mt-12">
      <div className="space-y-8">

        {/* ── Page title (Rule 4: aligned to same 480px) ── */}
        <div className="text-center space-y-1.5">
          <h1 className="text-[26px] sm:text-[30px] font-bold tracking-tight text-gray-900">
            Pay<span style={{ color: '#3b82f6' }}>roll</span>
          </h1>
          <p className="text-[13px] text-gray-400">Stream payment in USDC to anyone on Arc</p>
        </div>

        {/* ── Vault Card + How It Works ── */}
        <div className="space-y-4">

          {/* Vault Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-5 sm:p-7 space-y-6">

              {/* ── Recipient Address capsule ── */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="flex gap-0.5">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                    </span>
                    <span className="text-[13px] font-semibold text-gray-700">Recipient Address</span>
                  </div>
                  <span className="text-[11px] text-gray-400">Arc Network</span>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    placeholder="0x... (40 hex chars)"
                    value={recipient}
                    onChange={e => setRecipient(e.target.value.trim())}
                    spellCheck={false}
                    disabled={isWorking}
                    className={[
                      'w-full rounded-xl border-2 px-4 py-3 text-[13px] font-mono min-h-[48px]',
                      'placeholder:text-gray-300 placeholder:font-sans focus:outline-none transition-colors',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      recipient && !recipientValid
                        ? 'border-red-200 bg-red-50/30'
                        : recipientValid
                        ? 'border-blue-200 bg-blue-50/20'
                        : 'border-gray-200 focus:border-gray-400',
                    ].join(' ')}
                  />
                  {recipientValid && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        Address Valid
                      </span>
                    </div>
                  )}
                </div>

                {recipientValid && (
                  <p className="text-[11px] text-blue-500 flex items-center gap-1">
                    <CheckIcon small />
                    {recipient.slice(0, 10)}…{recipient.slice(-8)}
                  </p>
                )}
                {recipient && !recipientValid && (
                  <p className="text-[11px] text-red-400">Enter a valid EVM address</p>
                )}
              </div>

              {/* ── Amount capsule ── */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <ChainIcon />
                  <span className="text-[13px] font-semibold text-gray-700">Amount</span>
                </div>
                <div className="flex overflow-hidden rounded-xl border-2 border-gray-200 bg-white transition-colors focus-within:border-gray-400">
                  <input
                    type="number"
                    placeholder="0.0"
                    min="0" step="any"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    disabled={isWorking}
                    className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[14px] font-semibold focus:outline-none disabled:opacity-50 placeholder:text-gray-300 placeholder:font-normal min-h-[48px]"
                  />
                  <div className="flex items-center px-4 border-l-2 border-gray-200 bg-gray-50 shrink-0">
                    <span className="text-[12px] font-bold text-gray-500 select-none">USDC</span>
                  </div>
                </div>
                {isConnected && isOnArc && usdcBalance !== undefined ? (
                  <p className="text-[11px] text-gray-400">
                    Balance:{' '}
                    <span className={`font-semibold ${insufficientFunds ? 'text-red-500' : 'text-gray-600'}`}>
                      {formatUsdcFull(usdcBalance)} USDC
                    </span>
                    {insufficientFunds && <span className="ml-1.5 font-semibold text-red-500">— insufficient</span>}
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-400">USDC on Arc Network</p>
                )}
              </div>

              {/* ── Duration capsule ── */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <ClockIcon />
                  <span className="text-[13px] font-semibold text-gray-700">Duration</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {DURATIONS.map(d => {
                    const active = durationPreset === d.secs
                    return (
                      <button
                        key={d.label}
                        type="button"
                        disabled={isWorking}
                        onClick={() => { setDurationPreset(d.secs); setCustomDays('') }}
                        className="rounded-xl border-2 px-3.5 py-2.5 text-[12px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                        style={active
                          ? { background: '#111827', borderColor: '#111827', color: '#ffffff' }
                          : { background: '#ffffff', borderColor: '#e5e7eb', color: '#4b5563' }}
                      >
                        {d.label}
                      </button>
                    )
                  })}
                </div>
                <div className="flex overflow-hidden rounded-xl border-2 border-gray-200 bg-white transition-colors focus-within:border-gray-400">
                  <input
                    type="number"
                    placeholder="Custom days"
                    min="0.1" step="0.1"
                    value={customDays}
                    disabled={isWorking}
                    onChange={e => { setCustomDays(e.target.value); setDurationPreset(null) }}
                    className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[13px] focus:outline-none disabled:opacity-50 placeholder:text-gray-300 min-h-[48px]"
                  />
                  <div className="flex items-center px-4 border-l-2 border-gray-200 bg-gray-50 shrink-0">
                    <span className="text-[12px] font-bold text-gray-500 select-none">DAYS</span>
                  </div>
                </div>
              </div>

              {/* ── Memo capsule ── */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <TagIcon />
                  <span className="text-[13px] font-semibold text-gray-700">Memo</span>
                  <span className="text-[11px] text-gray-400">optional · stored on-chain</span>
                </div>
                <input
                  type="text"
                  placeholder="e.g., April Salary, Freelance Gig…"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  disabled={isWorking}
                  maxLength={80}
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-[13px] placeholder:text-gray-300 focus:outline-none focus:border-gray-400 transition-colors disabled:opacity-50 min-h-[48px]"
                />
              </div>

              {/* ── CTA ── */}
              <div className="space-y-2.5 pt-1">
                {circleAvailable && (
                  <div className="rounded-2xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/40 dark:bg-blue-950/20 p-3.5 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold text-gray-800 dark:text-gray-100">Circle Smart Wallet on Arc</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">Default for Telegram StreamPay links</p>
                      </div>
                    </div>

                    {!circleSession && (
                      <input
                        type="email"
                        placeholder="email@example.com"
                        value={circleEmail}
                        onChange={e => setCircleEmail(e.target.value)}
                        disabled={isWorking}
                        className="w-full rounded-xl border-2 border-blue-100 dark:border-blue-900/40 bg-white dark:bg-[#15151a] px-4 py-3 text-[13px] text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:outline-none focus:border-blue-300 transition-colors disabled:opacity-50 min-h-[46px]"
                      />
                    )}

                    {circleSession && (
                      <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-white dark:bg-[#15151a] px-3 py-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Smart wallet</p>
                            <p className="truncate font-mono text-[11px] text-gray-600 dark:text-gray-300">
                              {circleSession.wallet.address.slice(0, 8)}...{circleSession.wallet.address.slice(-6)}
                            </p>
                      </div>
                          <button
                            type="button"
                            onClick={handleCopyCircleWallet}
                            className="shrink-0 rounded-lg border border-gray-200 dark:border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300"
                          >
                            {circleCopied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className={`min-w-0 text-[11px] font-semibold ${circleNeedsFunds ? 'text-red-500' : 'text-gray-500'}`}>
                            Balance: {circleBalance === null ? 'checking...' : `${formatWalletUsdc(circleBalance)} USDC`}
                            {circleNeedsFunds ? ' - fund wallet first' : ''}
                          </p>
                          <button
                            type="button"
                            onClick={() => refreshCircleBalance()}
                            disabled={circleBalanceRefreshing || isWorking}
                            aria-label="Refresh Circle wallet balance"
                            title="Refresh balance"
                            className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:text-gray-700 disabled:opacity-50 dark:text-gray-500 dark:hover:text-gray-200"
                          >
                            <RefreshCw className={`h-3 w-3 ${circleBalanceRefreshing ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={circleDeployReady ? handleCircleDeploy : undefined}
                      disabled={!circleDeployReady}
                      className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[14px] font-bold transition-all active:scale-[0.98] min-h-[52px]"
                      style={circleDeployReady
                        ? { background: '#111827', color: '#ffffff', cursor: 'pointer' }
                        : { background: '#e5e7eb', color: '#9ca3af', cursor: 'not-allowed' }}
                    >
                      {isWorking
                        ? <><Spinner /><span className="text-[13px] font-medium">{statusMsg}</span></>
                        : 'Start with Circle Smart Wallet'}
                    </button>
                    <div className="flex justify-center">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-[#15151a] px-3 py-1">
                        <img src="/brand/circle-logo.jpeg" alt="" className="h-3 w-3 rounded-full object-cover" />
                        <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500">Powered by Circle</span>
                      </span>
                    </div>
                  </div>
                )}

                {/* Wrong network — replace primary button */}
                {isConnected && !isOnArc && (
                  <button
                    onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[14px] font-semibold transition-colors active:scale-[0.98] min-h-[52px]"
                    style={{ background: '#111827', color: '#ffffff' }}
                  >
                    Switch to Arc Network
                  </button>
                )}

                {/* START STREAMING — always visible, state reflects readiness */}
                {(!circleAvailable && (!isConnected || isOnArc)) && (
                  <button
                    onClick={deployReady ? handleDeploy : undefined}
                    disabled={!deployReady}
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[14px] font-bold tracking-widest transition-all active:scale-[0.98] min-h-[52px]"
                    style={deployReady
                      ? { background: '#111827', color: '#ffffff', cursor: 'pointer' }
                      : { background: '#f3f4f6', color: '#9ca3af', cursor: 'not-allowed' }}
                  >
                    {isWorking
                      ? <><Spinner /><span className="text-[13px] font-medium tracking-normal">{statusMsg}</span></>
                      : circleAvailable ? 'Use Connected Wallet Instead' : 'START STREAMING'}
                  </button>
                )}

                {insufficientFunds && !isWorking && !circleNeedsFunds && (
                  <p className="text-center text-[12px] font-semibold text-red-500">
                    Insufficient USDC — fund your Arc wallet first
                  </p>
                )}
                {hint && !insufficientFunds && !circleNeedsFunds && (
                  <p className="text-center text-[12px] text-gray-400">{hint}</p>
                )}
                {error && (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-center text-[12px] text-red-500">
                    {error}
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* ── How It Works ── */}
          <div className="space-y-3 pt-1">
            <p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
              How It Works
            </p>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {([
                { n: '1', title: 'Fund vault',    desc: 'USDC is pre-loaded into a ghost vault' },
                { n: '2', title: 'Stream begins', desc: 'Funds unlock linearly to the recipient' },
                { n: '3', title: 'Claim anytime', desc: 'Recipient withdraws gaslessly on Arc' },
              ] as const).map(s => (
                <div key={s.n} className="rounded-2xl border border-gray-100 bg-white p-3 sm:p-4 text-center shadow-sm space-y-1.5">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-[11px] font-semibold text-gray-500">
                    {s.n}
                  </span>
                  <p className="text-[11px] sm:text-[12px] font-bold text-gray-800">{s.title}</p>
                  <p className="text-[10px] sm:text-[11px] leading-snug text-gray-400">{s.desc}</p>
                </div>
              ))}
            </div>

            {/* ── Footer links ── */}
            <div className="border-t border-gray-100 pt-4 flex items-center justify-center gap-8">
              <a
                href="mailto:support@hashpaylink.com"
                className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-900 transition-colors"
              >
                <Mail className="h-3.5 w-3.5" />
                support@hashpaylink.com
              </a>
              <a
                href="https://x.com/Streampay_"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-900 transition-colors"
              >
                <XIcon className="h-3.5 w-3.5" />
                @Streampay_
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Shared badge ──────────────────────────────────────────────────────────────
export function HashPayLinkBadge() {
  return (
    <div className="flex justify-center">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
        <img src="/hash-logo.png" alt="#" className="h-3 w-3 opacity-50" />
        <span className="text-[10px] font-semibold text-gray-400">Powered by Hash PayLink</span>
      </span>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function CheckIcon({ small }: { small?: boolean }) {
  return (
    <svg className={`${small ? 'h-3 w-3' : 'h-4 w-4'} shrink-0`} fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

function ChainIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function TagIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  )
}

function StreamIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
    </svg>
  )
}

function ExtLinkIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// StreamIcon used in _unused_ legacy; keeping for potential future use
export { StreamIcon }
