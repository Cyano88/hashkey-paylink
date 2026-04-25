import { useState } from 'react'
import {
  useAccount, useChainId, useSwitchChain,
  useReadContract, useWriteContract, usePublicClient,
} from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { isAddress, parseAbi, parseEventLogs } from 'viem'
import { STREAM_VAULT_FACTORY_ABI } from '../lib/streamVaultAbi'
import { formatUsdcFull } from './TriStateBar'

// ── Arc constants ─────────────────────────────────────────────────────────────
const ARC_CHAIN_ID = 5042002
const ARC_USDC     = '0x3600000000000000000000000000000000000000' as const
const ARC_EXPLORER = 'https://testnet.arcscan.app'

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
])

// ── Duration presets ──────────────────────────────────────────────────────────
const DURATIONS = [
  { label: '1 hr',    secs: 3_600n },
  { label: '8 hrs',   secs: 28_800n },
  { label: '24 hrs',  secs: 86_400n },
  { label: '7 days',  secs: 604_800n },
  { label: '30 days', secs: 2_592_000n },
]

type Step = 'form' | 'funding' | 'creating' | 'success'

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

// ── Routing: build stream link that survives the ?app=streampay toggle ─────────
// If we're on a dedicated streampay hostname, the path alone is enough.
// If we're on the shared Render domain (accessed via ?app=streampay), we must
// preserve that param so App.tsx still mounts StreamPayApp after navigation.
function buildStreamLink(vault: `0x${string}`, reason: string): string {
  const { hostname, origin } = window.location
  const isDedicatedHost =
    hostname === 'streampay.xyz' ||
    hostname.endsWith('.streampay.xyz') ||
    hostname.includes('streampay')

  const params = new URLSearchParams()
  if (!isDedicatedHost) params.set('app', 'streampay')
  if (reason.trim())   params.set('reason', reason.trim())
  const qs = params.toString()
  return `${origin}/stream/${vault}${qs ? `?${qs}` : ''}`
}

// ── Metallic 'O' logo (ash/black gradient, smaller) ───────────────────────────
function StreamPayLogo({ size = 15 }: { size?: number }) {
  const id = 'sp-metal'
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#9a9a9a" />
          <stop offset="45%"  stopColor="#1a1a1a" />
          <stop offset="100%" stopColor="#6a6a6a" />
        </linearGradient>
      </defs>
      <circle cx="9" cy="9" r="7.5" stroke={`url(#${id})`} strokeWidth="2.2" />
      <circle cx="9" cy="9" r="3.2" fill={`url(#${id})`} />
    </svg>
  )
}

// ── Focused-border helper — Tailwind can't do arbitrary focus-within colors ──
const inputBase = [
  'w-full rounded-xl border-2 bg-white px-4 py-3.5 text-[13px] text-[#0a0a0a]',
  'placeholder:text-gray-300 transition-colors outline-none',
  'border-[#d0d0d0] focus:border-[#00FF41]',
  'disabled:opacity-55 disabled:cursor-not-allowed',
].join(' ')

// ── Component ─────────────────────────────────────────────────────────────────
export function CreateStreamForm() {
  const { address: connectedAddr, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain }        = useSwitchChain()
  const { openConnectModal }   = useConnectModal()
  const { writeContractAsync } = useWriteContract()
  const publicClient           = usePublicClient({ chainId: ARC_CHAIN_ID })

  const isOnArc     = chainId === ARC_CHAIN_ID
  const factoryAddr = (import.meta.env.VITE_STREAM_FACTORY_ADDRESS ?? '') as `0x${string}`

  // ── Form state ────────────────────────────────────────────────────────────
  const [recipient,      setRecipient]      = useState('')
  const [amount,         setAmount]         = useState('')
  const [durationPreset, setDurationPreset] = useState<bigint | null>(null)
  const [customDays,     setCustomDays]     = useState('')
  const [reason,         setReason]         = useState('')
  const [salt] = useState<`0x${string}`>(genSalt)

  // ── Tx state ──────────────────────────────────────────────────────────────
  const [step,         setStep]         = useState<Step>('form')
  const [statusMsg,    setStatusMsg]    = useState('')
  const [error,        setError]        = useState<string | null>(null)
  const [streamLink,   setStreamLink]   = useState<string | null>(null)
  const [deployTxHash, setDeployTxHash] = useState<string | null>(null)

  // ── Derived ───────────────────────────────────────────────────────────────
  const recipientValid = isAddress(recipient)
  const amountBn       = parseUsdc(amount)
  const amountValid    = amountBn > 0n
  const durationSecs   = durationPreset
    ?? (customDays ? BigInt(Math.round(parseFloat(customDays) * 86400)) : 0n)
  const durationValid  = durationSecs > 0n
  const isFormValid    = recipientValid && amountValid && durationValid && isConnected && isOnArc && !!factoryAddr

  // ── USDC balance ──────────────────────────────────────────────────────────
  const { data: usdcBalance } = useReadContract({
    address:      ARC_USDC,
    abi:          ERC20_ABI,
    functionName: 'balanceOf',
    args:         [connectedAddr ?? '0x0000000000000000000000000000000000000000'],
    query:        { enabled: !!connectedAddr && isOnArc, refetchInterval: 10_000 },
  })

  // Treat "not yet loaded" as sufficient — we show warning separately
  const hasEnoughBalance = usdcBalance === undefined ? true : usdcBalance >= amountBn

  // ── Step indicators ───────────────────────────────────────────────────────
  const steps = [
    { label: 'Setup',         done: isFormValid },
    { label: 'Fund Vault',    done: step === 'creating' || step === 'success' },
    { label: 'Deploy Stream', done: step === 'success' },
  ]

  // ── Ghost-vault deploy ────────────────────────────────────────────────────
  async function handleDeploy() {
    if (!isFormValid || !connectedAddr || !publicClient) return
    setError(null)

    const startTime = BigInt(Math.floor(Date.now() / 1000) + 120)
    const endTime   = startTime + durationSecs

    try {
      const predicted = await publicClient.readContract({
        address:      factoryAddr,
        abi:          STREAM_VAULT_FACTORY_ABI,
        functionName: 'getVaultAddress',
        args:         [connectedAddr, recipient as `0x${string}`, amountBn, startTime, endTime, salt],
      }) as `0x${string}`

      setStep('funding')
      setStatusMsg('Sign to transfer USDC to vault…')
      const fundTx = await writeContractAsync({
        address: ARC_USDC, abi: ERC20_ABI,
        functionName: 'transfer',
        args: [predicted, amountBn],
        gas: 100_000n,
      })
      setStatusMsg('Confirming transfer on Arc…')
      await publicClient.waitForTransactionReceipt({ hash: fundTx })

      setStep('creating')
      setStatusMsg('Sign to deploy the stream vault…')
      const deployTx = await writeContractAsync({
        address:      factoryAddr,
        abi:          STREAM_VAULT_FACTORY_ABI,
        functionName: 'createStream',
        args:         [recipient as `0x${string}`, amountBn, startTime, endTime, salt],
        gas:          2_000_000n,
      })
      setDeployTxHash(deployTx)
      setStatusMsg('Deploying vault on Arc…')
      const receipt = await publicClient.waitForTransactionReceipt({ hash: deployTx })

      const logs  = parseEventLogs({ abi: STREAM_VAULT_FACTORY_ABI, logs: receipt.logs })
      const event = logs.find(l => l.eventName === 'StreamCreated')
      const vault = (event?.args as { vault?: `0x${string}` })?.vault
      if (!vault) throw new Error('Could not extract vault address from receipt.')

      setStreamLink(buildStreamLink(vault, reason))
      setStep('success')
      setStatusMsg('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied')) {
        setStep('form'); setStatusMsg(''); return
      }
      setError(msg.slice(0, 180))
      setStep('form')
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (step === 'success' && streamLink) {
    return (
      <div className="mx-auto w-full max-w-lg font-inter">
        <div className="rounded-2xl border border-gray-100 bg-white shadow-xl">
          <div className="px-10 py-12 text-center space-y-6">

            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: 'rgba(0,255,65,0.08)', border: '1.5px solid rgba(0,255,65,0.3)' }}>
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                strokeWidth={2.5} style={{ color: '#00CC33' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>

            <div>
              <p className="text-[17px] font-bold text-[#0a0a0a]">Stream Deployed</p>
              {reason && (
                <p className="mt-1 text-[12px] font-semibold uppercase tracking-wider text-[#4a4a4a]">
                  {reason}
                </p>
              )}
              <p className="mt-1.5 text-[13px] text-[#4a4a4a]">
                {formatUsdcFull(amountBn)} USDC streaming to{' '}
                <span className="font-mono text-[#0a0a0a]">{recipient.slice(0, 6)}…{recipient.slice(-4)}</span>
              </p>
            </div>

            <div className="rounded-xl border-2 border-[#e8e8e8] bg-[#fafafa] p-4 text-left space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#4a4a4a]">
                Share Stream Link
              </p>
              <p className="break-all font-mono text-[11px] text-[#4a4a4a] leading-relaxed">
                {streamLink}
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => navigator.clipboard.writeText(streamLink)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#0a0a0a] py-2.5 text-[12px] font-semibold text-white hover:bg-[#2a2a2a] transition-colors"
                >
                  Copy Link
                </button>
                {/* Full navigation — includes ?app=streampay so StreamPayApp mounts correctly */}
                <a
                  href={streamLink}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 border-[#e8e8e8] py-2.5 text-[12px] font-semibold text-[#0a0a0a] hover:border-[#00FF41] transition-colors"
                >
                  View Stream
                </a>
              </div>
            </div>

            {deployTxHash && (
              <a href={`${ARC_EXPLORER}/tx/${deployTxHash}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 text-[12px] text-[#4a4a4a] hover:text-[#0a0a0a] transition-colors">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                View on Arcscan
              </a>
            )}
          </div>
          <CardFooter />
        </div>
      </div>
    )
  }

  // ── Form screen ───────────────────────────────────────────────────────────
  const isWorking      = step === 'funding' || step === 'creating'
  const deployReady    = isFormValid && !isWorking && hasEnoughBalance

  return (
    <div className="mx-auto w-full max-w-lg font-inter">
      <div className="rounded-2xl border border-gray-100 bg-white shadow-xl">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-[#f0f0f0] px-10 py-5">
          <div className="flex items-center gap-2.5">
            <StreamPayLogo size={15} />
            <span className="text-[13px] font-bold uppercase tracking-[0.2em] text-[#0a0a0a]">
              StreamPay
            </span>
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#4a4a4a]">
            New Stream
          </span>
        </div>

        {/* ── Step pills ─────────────────────────────────────────────── */}
        <div className="flex items-center border-b border-[#f0f0f0] px-10 py-4">
          {steps.map((s, i) => (
            <div key={s.label} className="flex items-center">
              <div className="flex items-center gap-1.5">
                <div
                  className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-bold"
                  style={s.done
                    ? { background: '#00FF41', color: '#0a0a0a' }
                    : { background: '#ebebeb', color: '#8a8a8a' }}
                >
                  {s.done ? '✓' : i + 1}
                </div>
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: s.done ? '#0a0a0a' : '#9a9a9a' }}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && <div className="mx-3 h-px w-7 bg-[#e8e8e8]" />}
            </div>
          ))}
        </div>

        {/* ── Fields ─────────────────────────────────────────────────── */}
        <div className="space-y-6 px-10 py-8">

          {/* Recipient */}
          <Field label="Recipient Wallet">
            <input
              type="text"
              placeholder="0x… EVM address on Arc"
              value={recipient}
              onChange={e => setRecipient(e.target.value.trim())}
              spellCheck={false}
              disabled={isWorking}
              className={[
                inputBase, 'font-mono',
                recipient && !recipientValid ? '!border-red-300 !focus:border-red-400' : '',
                recipientValid ? '!border-emerald-300' : '',
              ].join(' ')}
            />
            {recipient && !recipientValid && (
              <p className="text-[11px] font-medium text-red-400 mt-1">Enter a valid EVM address</p>
            )}
          </Field>

          {/* Amount — input-group, USDC never overflows */}
          <Field label="Total Amount">
            <div className="flex items-stretch rounded-xl border-2 border-[#d0d0d0] bg-white transition-colors focus-within:border-[#00FF41] overflow-hidden">
              <input
                type="number"
                placeholder="0.00"
                min="0"
                step="any"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                disabled={isWorking}
                className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-[14px] font-semibold text-[#0a0a0a] placeholder:font-normal placeholder:text-gray-300 focus:outline-none disabled:opacity-55"
              />
              <div className="flex items-center border-l-2 border-[#e8e8e8] bg-[#fafafa] px-4">
                <span className="text-[12px] font-bold text-[#4a4a4a] select-none">USDC</span>
              </div>
            </div>
            {isConnected && isOnArc && usdcBalance !== undefined && (
              <p className="mt-1.5 text-[11px] text-[#4a4a4a]">
                Balance: <span className="font-semibold text-[#0a0a0a]">{formatUsdcFull(usdcBalance)} USDC</span>
                {amountValid && usdcBalance < amountBn && (
                  <span className="ml-2 font-semibold text-red-500">— insufficient</span>
                )}
              </p>
            )}
          </Field>

          {/* Duration */}
          <Field label="Duration">
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map(d => {
                const active = durationPreset === d.secs
                return (
                  <button
                    key={d.label}
                    type="button"
                    disabled={isWorking}
                    onClick={() => { setDurationPreset(d.secs); setCustomDays('') }}
                    className="rounded-lg border-2 px-4 py-2 text-[12px] font-semibold transition-all disabled:opacity-55"
                    style={active
                      ? { background: '#00FF41', borderColor: '#00FF41', color: '#0a0a0a' }
                      : { background: 'transparent', borderColor: '#d0d0d0', color: '#4a4a4a' }}
                  >
                    {d.label}
                  </button>
                )
              })}
              {/* Custom days */}
              <div className={[
                'flex items-center rounded-lg border-2 transition-colors overflow-hidden bg-white',
                durationPreset === null && customDays ? 'border-[#00FF41]' : 'border-[#d0d0d0]',
              ].join(' ')}>
                <input
                  type="number"
                  placeholder="Custom"
                  min="0.1"
                  step="0.1"
                  value={customDays}
                  disabled={isWorking}
                  onChange={e => { setCustomDays(e.target.value); setDurationPreset(null) }}
                  className="w-20 bg-transparent px-3 py-2 text-[12px] font-semibold text-[#0a0a0a] placeholder:font-normal placeholder:text-gray-300 focus:outline-none disabled:opacity-55"
                />
                <span className="pr-3 text-[11px] text-[#4a4a4a] select-none">days</span>
              </div>
            </div>
          </Field>

          {/* Reason for Stream */}
          <Field label="Reason for Stream">
            <input
              type="text"
              placeholder="e.g., April Salary, Freelance Gig…"
              value={reason}
              onChange={e => setReason(e.target.value)}
              disabled={isWorking}
              maxLength={80}
              className={inputBase}
            />
          </Field>

          {/* ── CTA ───────────────────────────────────────────────────── */}
          <div className="space-y-3 pt-1">

            {/* Not connected */}
            {!isConnected && (
              <button
                onClick={() => openConnectModal?.()}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-[14px] font-bold transition-all active:scale-[0.98]"
                style={{ background: '#00FF41', color: '#0a0a0a' }}
              >
                <WalletIcon />
                Connect Wallet
              </button>
            )}

            {/* Wrong network */}
            {isConnected && !isOnArc && (
              <button
                onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#0a0a0a] bg-[#0a0a0a] py-3.5 text-[14px] font-bold text-white transition-all hover:bg-[#2a2a2a] active:scale-[0.98]"
              >
                Switch to Arc Network
              </button>
            )}

            {/* Deploy button — always green when connected+Arc, opacity signals readiness */}
            {isConnected && isOnArc && (
              <>
                <button
                  onClick={handleDeploy}
                  disabled={!deployReady}
                  className="flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-[14px] font-bold transition-all active:scale-[0.98]"
                  style={{
                    background: '#00FF41',
                    color: '#0a0a0a',
                    opacity: deployReady ? 1 : 0.4,
                    cursor: deployReady ? 'pointer' : 'not-allowed',
                  }}
                >
                  {isWorking ? <><Spinner /> {statusMsg}</> : 'Deploy Stream'}
                </button>

                {isWorking && (
                  <p className="text-center text-[11px] font-medium text-[#4a4a4a]">
                    {step === 'funding' ? 'Step 1 of 2 — funding vault' : 'Step 2 of 2 — deploying contract'}
                  </p>
                )}

                {!isWorking && amountValid && usdcBalance !== undefined && usdcBalance < amountBn && (
                  <p className="text-center text-[12px] font-semibold text-red-500">
                    Insufficient USDC. Fund your wallet on Arc first.
                  </p>
                )}

                {!isWorking && (
                  <p className="text-center text-[11px] text-gray-300">
                    2 wallet signatures — fund vault, then deploy contract
                  </p>
                )}
              </>
            )}

            {error && (
              <div className="rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-center text-[12px] font-medium text-red-500">
                {error}
              </div>
            )}
          </div>
        </div>

        <CardFooter />
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[#4a4a4a]">
        {label}
      </label>
      {children}
    </div>
  )
}

function CardFooter() {
  return (
    <div className="flex items-center justify-center gap-2 border-t border-[#f0f0f0] bg-[#fafafa] py-3.5 rounded-b-2xl">
      <img src="/hash-logo.png" alt="" className="h-3.5 w-3.5 opacity-30" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-300">
        Powered by Hash PayLink
      </span>
    </div>
  )
}

function WalletIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18-3a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3m18-3V6" />
    </svg>
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
