import { useState, useMemo } from 'react'
import {
  useAccount, useChainId, useSwitchChain,
  useReadContract, useWriteContract, usePublicClient,
} from 'wagmi'
import { isAddress, parseAbi, parseEventLogs } from 'viem'
import { STREAM_VAULT_FACTORY_ABI } from '../lib/streamVaultAbi'
import { formatUsdcFull } from './TriStateBar'

// ── Arc constants ─────────────────────────────────────────────────────────────
const ARC_CHAIN_ID = 5042002
const ARC_USDC     = '0x3600000000000000000000000000000000000000' as const
const ARC_EXPLORER = 'https://testnet.arcscan.app'

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
])

// ── Duration presets ──────────────────────────────────────────────────────────
const DURATIONS = [
  { label: '1 hour',   secs: 3_600n },
  { label: '8 hours',  secs: 28_800n },
  { label: '24 hours', secs: 86_400n },
  { label: '7 days',   secs: 604_800n },
  { label: '30 days',  secs: 2_592_000n },
]

// ── Step types ────────────────────────────────────────────────────────────────
type Step = 'form' | 'approving' | 'creating' | 'success'

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseUsdc(val: string): bigint {
  const n = parseFloat(val)
  if (!isFinite(n) || n <= 0) return 0n
  return BigInt(Math.round(n * 1_000_000))
}

function genSalt(): `0x${string}` {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return `0x${[...arr].map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`
}

// ── Component ─────────────────────────────────────────────────────────────────
export function CreateStreamForm() {
  const { address: connectedAddr, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain }     = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient        = usePublicClient({ chainId: ARC_CHAIN_ID })

  const isOnArc = chainId === ARC_CHAIN_ID
  const factoryAddr = (import.meta.env.VITE_STREAM_FACTORY_ADDRESS ?? '') as `0x${string}`

  // ── Form state ────────────────────────────────────────────────────────────
  const [recipient,     setRecipient]     = useState('')
  const [amount,        setAmount]        = useState('')
  const [durationPreset, setDurationPreset] = useState<bigint | null>(null)
  const [customDays,    setCustomDays]    = useState('')
  const [salt]   = useState<`0x${string}`>(genSalt)  // stable per session

  // ── Step / tx state ───────────────────────────────────────────────────────
  const [step,       setStep]       = useState<Step>('form')
  const [statusMsg,  setStatusMsg]  = useState('')
  const [error,      setError]      = useState<string | null>(null)
  const [streamLink, setStreamLink] = useState<string | null>(null)
  const [deployTxHash, setDeployTxHash] = useState<string | null>(null)

  // ── Derived values ────────────────────────────────────────────────────────
  const recipientValid = isAddress(recipient)
  const amountBn       = parseUsdc(amount)
  const amountValid    = amountBn > 0n

  const durationSecs = durationPreset
    ?? (customDays ? BigInt(Math.round(parseFloat(customDays) * 86400)) : 0n)
  const durationValid = durationSecs > 0n

  const isFormValid = recipientValid && amountValid && durationValid && isConnected && isOnArc && !!factoryAddr

  // ── Contract reads ────────────────────────────────────────────────────────
  const { data: usdcBalance } = useReadContract({
    address:      ARC_USDC,
    abi:          ERC20_ABI,
    functionName: 'balanceOf',
    args:         [connectedAddr ?? '0x0000000000000000000000000000000000000000'],
    query:        { enabled: !!connectedAddr && isOnArc, refetchInterval: 10_000 },
  })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address:      ARC_USDC,
    abi:          ERC20_ABI,
    functionName: 'allowance',
    args:         [
      connectedAddr ?? '0x0000000000000000000000000000000000000000',
      factoryAddr,
    ],
    query: { enabled: !!connectedAddr && !!factoryAddr && isOnArc },
  })

  const hasEnoughBalance  = (usdcBalance ?? 0n) >= amountBn
  const hasEnoughAllowance = (allowance ?? 0n) >= amountBn
  const needsApproval     = isFormValid && !hasEnoughAllowance

  // ── Step summary for UI ───────────────────────────────────────────────────
  const steps = useMemo(() => [
    { label: 'Setup',         done: isFormValid },
    { label: 'Approve USDC',  done: hasEnoughAllowance && isFormValid },
    { label: 'Deploy Stream', done: step === 'success' },
  ], [isFormValid, hasEnoughAllowance, step])

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleApprove() {
    if (!connectedAddr || !factoryAddr) return
    setError(null)
    setStep('approving')
    setStatusMsg('Waiting for approval signature…')
    try {
      const txHash = await writeContractAsync({
        address:      ARC_USDC,
        abi:          ERC20_ABI,
        functionName: 'approve',
        args:         [factoryAddr, amountBn],
      })
      setStatusMsg('Confirming approval on Arc…')
      await publicClient!.waitForTransactionReceipt({ hash: txHash })
      await refetchAllowance()
      setStep('form')
      setStatusMsg('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied')) {
        setStep('form'); setStatusMsg(''); return
      }
      setError(msg.slice(0, 140))
      setStep('form')
    }
  }

  async function handleCreate() {
    if (!isFormValid || !connectedAddr || !publicClient) return
    setError(null)
    setStep('creating')
    setStatusMsg('Waiting for signature…')
    try {
      const startTime = BigInt(Math.floor(Date.now() / 1000) + 120)  // 2 min buffer
      const endTime   = startTime + durationSecs

      const txHash = await writeContractAsync({
        address:      factoryAddr,
        abi:          STREAM_VAULT_FACTORY_ABI,
        functionName: 'createStream',
        args: [
          recipient as `0x${string}`,
          amountBn,
          startTime,
          endTime,
          salt,
        ],
        gas: 500_000n,
      })
      setDeployTxHash(txHash)
      setStatusMsg('Deploying stream vault on Arc…')

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

      // Extract vault address from StreamCreated event
      const logs = parseEventLogs({ abi: STREAM_VAULT_FACTORY_ABI, logs: receipt.logs })
      const event = logs.find(l => l.eventName === 'StreamCreated')
      const vault = (event?.args as { vault?: `0x${string}` })?.vault

      if (!vault) throw new Error('Could not extract vault address from transaction receipt.')

      setStreamLink(`${window.location.origin}/stream/${vault}`)
      setStep('success')
      setStatusMsg('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied')) {
        setStep('form'); setStatusMsg(''); return
      }
      setError(msg.slice(0, 140))
      setStep('form')
    }
  }

  // ── Render: Success ───────────────────────────────────────────────────────
  if (step === 'success' && streamLink) {
    return (
      <div className="mx-auto w-full max-w-md font-inter">
        <div className="rounded-2xl border border-gray-100 bg-white shadow-lg">
          <div className="px-8 py-10 text-center space-y-5">

            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: 'rgba(0,255,65,0.12)', border: '1px solid rgba(0,255,65,0.3)' }}>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                strokeWidth={2.5} style={{ color: '#00CC33' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>

            <div>
              <p className="text-[15px] font-semibold text-gray-900">Stream Deployed</p>
              <p className="mt-1 text-[13px] text-gray-400">
                {formatUsdcFull(amountBn)} USDC is now streaming to{' '}
                <span className="font-mono">{recipient.slice(0, 6)}…{recipient.slice(-4)}</span>
              </p>
            </div>

            {/* Shareable link */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-left space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Your Stream Link
              </p>
              <p className="break-all font-mono text-[12px] text-gray-600">{streamLink}</p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => navigator.clipboard.writeText(streamLink)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gray-900 py-2 text-[12px] font-semibold text-white hover:bg-gray-700 transition-colors"
                >
                  Copy Link
                </button>
                <a
                  href={streamLink}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2 text-[12px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  View Stream
                </a>
              </div>
            </div>

            {deployTxHash && (
              <a
                href={`${ARC_EXPLORER}/tx/${deployTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                View on Arcscan
              </a>
            )}
          </div>

          <div className="flex items-center justify-center gap-1.5 border-t border-gray-50 bg-gray-50/40 py-3">
            <img src="/hash-logo.png" alt="" className="h-3.5 w-3.5 opacity-25" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-300">
              Powered by Hash PayLink
            </span>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: Form ──────────────────────────────────────────────────────────
  const isWorking = step === 'approving' || step === 'creating'

  return (
    <div className="mx-auto w-full max-w-md font-inter">
      <div className="rounded-2xl border border-gray-100 bg-white shadow-lg">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-50 px-6 py-4">
          <div className="flex items-center gap-2">
            <img src="/hash-logo.png" alt="" className="h-4 w-4 opacity-30" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-300">
              Hash PayLink
            </span>
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Create Stream
          </span>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 border-b border-gray-50 px-6 py-3">
          {steps.map((s, i) => (
            <div key={s.label} className="flex items-center">
              <div className="flex items-center gap-1.5">
                <div className={[
                  'flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold',
                  s.done ? 'bg-[#00FF41] text-black' : 'bg-gray-100 text-gray-400',
                ].join(' ')}>
                  {s.done ? '✓' : i + 1}
                </div>
                <span className={`text-[11px] font-medium ${s.done ? 'text-gray-700' : 'text-gray-400'}`}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className="mx-2 h-px w-5 bg-gray-100" />
              )}
            </div>
          ))}
        </div>

        <div className="space-y-5 px-6 py-6">

          {/* Recipient */}
          <div className="space-y-1.5">
            <label className="block text-[12px] font-semibold uppercase tracking-wider text-gray-400">
              Recipient Wallet
            </label>
            <input
              type="text"
              placeholder="0x… EVM address on Arc"
              value={recipient}
              onChange={e => setRecipient(e.target.value.trim())}
              spellCheck={false}
              className={[
                'w-full rounded-xl border bg-gray-50/60 px-4 py-3 font-mono text-sm',
                'placeholder:text-gray-300 transition-all focus:bg-white focus:outline-none focus:ring-2',
                recipient && !recipientValid
                  ? 'border-red-200 text-red-600 focus:ring-red-100'
                  : recipientValid
                  ? 'border-emerald-200 text-gray-900 focus:ring-emerald-100'
                  : 'border-gray-200 text-gray-900 focus:border-gray-300 focus:ring-gray-100',
              ].join(' ')}
            />
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <label className="block text-[12px] font-semibold uppercase tracking-wider text-gray-400">
              Total Amount
            </label>
            <div className="relative">
              <input
                type="number"
                placeholder="0.00"
                min="0"
                step="any"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3 pr-16 text-sm placeholder:text-gray-300 transition-all focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-100"
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-gray-400">
                USDC
              </span>
            </div>
            {usdcBalance !== undefined && (
              <p className="text-[11px] text-gray-400">
                Balance: {formatUsdcFull(usdcBalance)} USDC
                {amountValid && !hasEnoughBalance && (
                  <span className="ml-1.5 text-red-400">— insufficient</span>
                )}
              </p>
            )}
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <label className="block text-[12px] font-semibold uppercase tracking-wider text-gray-400">
              Duration
            </label>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map(d => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => { setDurationPreset(d.secs); setCustomDays('') }}
                  className={[
                    'rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all',
                    durationPreset === d.secs
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-200 text-gray-600 hover:border-gray-400',
                  ].join(' ')}
                >
                  {d.label}
                </button>
              ))}
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  placeholder="Custom"
                  min="0.1"
                  step="0.1"
                  value={customDays}
                  onChange={e => { setCustomDays(e.target.value); setDurationPreset(null) }}
                  className="w-20 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[12px] text-gray-700 focus:border-gray-400 focus:outline-none"
                />
                <span className="text-[11px] text-gray-400">days</span>
              </div>
            </div>
          </div>

          {/* Network gate */}
          {isConnected && !isOnArc && (
            <button
              onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-3.5 text-[14px] font-semibold text-white hover:bg-gray-700 transition-colors"
            >
              Switch to Arc Network
            </button>
          )}

          {/* Not connected */}
          {!isConnected && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 py-3.5 text-center text-[13px] text-gray-400">
              Connect your wallet to continue
            </div>
          )}

          {/* Action: Approve or Create */}
          {isConnected && isOnArc && (
            <div className="space-y-2.5">
              {needsApproval && (
                <button
                  onClick={handleApprove}
                  disabled={!isFormValid || isWorking || !hasEnoughBalance}
                  className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-gray-200 py-3.5 text-[14px] font-semibold text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isWorking && step === 'approving'
                    ? <><Spinner /> {statusMsg}</>
                    : `Approve ${amount || '0'} USDC`}
                </button>
              )}

              <button
                onClick={handleCreate}
                disabled={!isFormValid || isWorking || needsApproval || !hasEnoughBalance}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-[14px] font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                style={
                  !isWorking && !needsApproval && isFormValid && hasEnoughBalance
                    ? { background: '#00FF41', color: '#0a0a0a' }
                    : { background: '#f3f4f6', color: '#9ca3af' }
                }
              >
                {isWorking && step === 'creating'
                  ? <><Spinner /> {statusMsg}</>
                  : 'Deploy Stream'}
              </button>

              {!hasEnoughBalance && amountValid && isOnArc && (
                <p className="text-center text-[12px] text-red-400">
                  Insufficient USDC. Fund your wallet on Arc first.
                </p>
              )}

              {error && (
                <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-center text-[12px] text-red-500">
                  {error}
                </p>
              )}

              <p className="text-center text-[11px] text-gray-300">
                You'll need a small amount of Arc USDC for gas fees (~0.01 USDC)
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-1.5 border-t border-gray-50 bg-gray-50/40 py-3">
          <img src="/hash-logo.png" alt="" className="h-3.5 w-3.5 opacity-25" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-300">
            Powered by Hash PayLink
          </span>
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
