import { useState } from 'react'
import {
  useAccount, useChainId, useSwitchChain,
  useDisconnect, useReadContract, useWriteContract, usePublicClient,
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

// Preserve ?app=streampay on shared Render hostname so routing stays in StreamPayApp
function buildStreamLink(vault: `0x${string}`, reason: string): string {
  const { hostname, origin } = window.location
  const isDedicatedHost =
    hostname === 'streampay.xyz' ||
    hostname.endsWith('.streampay.xyz') ||
    hostname.includes('streampay')
  const p = new URLSearchParams()
  if (!isDedicatedHost) p.set('app', 'streampay')
  if (reason.trim())    p.set('reason', reason.trim())
  const qs = p.toString()
  return `${origin}/stream/${vault}${qs ? `?${qs}` : ''}`
}

// ── Metallic 'O' logomark ─────────────────────────────────────────────────────
function Logomark() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
      <defs>
        <linearGradient id="sp-g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#888" />
          <stop offset="50%"  stopColor="#111" />
          <stop offset="100%" stopColor="#555" />
        </linearGradient>
      </defs>
      <circle cx="9" cy="9" r="7.5" stroke="url(#sp-g)" strokeWidth="2" />
      <circle cx="9" cy="9" r="3"   fill="url(#sp-g)" />
    </svg>
  )
}

// ── Design tokens ─────────────────────────────────────────────────────────────
// Matches the solid, high-contrast weight of the HashPayLink recipient card
const T = {
  labelColor:    '#333333',
  primaryText:   '#0a0a0a',
  mutedText:     '#6b6b6b',
  borderIdle:    '#d4d4d4',
  borderFocus:   '#00FF41',
  bgSurface:     '#f8f8f8',
  green:         '#00FF41',
}

// Shared input shell — border-2, consistent rounded-xl, green on focus
const inputShell = [
  'w-full rounded-xl border-2 bg-white px-4 py-3 text-[13px] font-medium',
  'placeholder:text-gray-300 placeholder:font-normal',
  'outline-none transition-colors',
  'disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ')

// ── Component ─────────────────────────────────────────────────────────────────
export function CreateStreamForm() {
  const { address: connectedAddr, isConnected } = useAccount()
  const chainId                = useChainId()
  const { switchChain }        = useSwitchChain()
  const { disconnect }         = useDisconnect()
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
  const isFormValid    = recipientValid && amountValid && durationValid
                         && isConnected && isOnArc && !!factoryAddr

  // ── USDC balance ──────────────────────────────────────────────────────────
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

  // ── Step indicators ───────────────────────────────────────────────────────
  const STEPS = [
    { label: 'Setup',         done: isFormValid },
    { label: 'Fund Vault',    done: step === 'creating' || step === 'success' },
    { label: 'Deploy Stream', done: step === 'success' },
  ]

  // ── Ghost-vault deploy ────────────────────────────────────────────────────
  async function handleDeploy() {
    if (!deployReady || !connectedAddr || !publicClient) return
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
      setStatusMsg('Sign to fund vault…')
      const fundTx = await writeContractAsync({
        address: ARC_USDC, abi: ERC20_ABI,
        functionName: 'transfer',
        args: [predicted, amountBn],
        gas: 100_000n,
      })
      setStatusMsg('Confirming on Arc…')
      await publicClient.waitForTransactionReceipt({ hash: fundTx })

      setStep('creating')
      setStatusMsg('Sign to deploy vault…')
      const deployTx = await writeContractAsync({
        address:      factoryAddr,
        abi:          STREAM_VAULT_FACTORY_ABI,
        functionName: 'createStream',
        args:         [recipient as `0x${string}`, amountBn, startTime, endTime, salt],
        gas:          2_000_000n,
      })
      setDeployTxHash(deployTx)
      setStatusMsg('Deploying on Arc…')
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
      <div className="mx-auto w-full max-w-lg">
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg">
          <CardHeader />
          <div className="px-12 py-10 space-y-6 text-center">

            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: 'rgba(0,255,65,0.08)', border: '1.5px solid rgba(0,255,65,0.28)' }}>
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={2.5} style={{ color: '#00CC33' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>

            <div className="space-y-1">
              <p className="text-[18px] font-bold" style={{ color: T.primaryText }}>Stream Deployed</p>
              {reason && (
                <p className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: T.labelColor }}>
                  {reason}
                </p>
              )}
              <p className="text-[13px]" style={{ color: T.mutedText }}>
                {formatUsdcFull(amountBn)} USDC streaming to{' '}
                <span className="font-mono font-semibold" style={{ color: T.primaryText }}>
                  {recipient.slice(0, 6)}…{recipient.slice(-4)}
                </span>
              </p>
            </div>

            <div className="rounded-xl border-2 p-4 text-left space-y-3"
              style={{ borderColor: T.borderIdle, background: T.bgSurface }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.labelColor }}>
                Share Stream Link
              </p>
              <p className="break-all font-mono text-[11px] leading-relaxed" style={{ color: T.mutedText }}>
                {streamLink}
              </p>
              <div className="flex gap-2.5 pt-0.5">
                <button
                  onClick={() => navigator.clipboard.writeText(streamLink)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-semibold text-white transition-colors hover:opacity-90"
                  style={{ background: T.primaryText }}
                >
                  Copy Link
                </button>
                <a href={streamLink}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 py-2.5 text-[12px] font-semibold transition-colors hover:border-[#00FF41]"
                  style={{ borderColor: T.borderIdle, color: T.primaryText }}>
                  View Stream
                </a>
              </div>
            </div>

            {deployTxHash && (
              <a href={`${ARC_EXPLORER}/tx/${deployTxHash}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] transition-colors hover:opacity-70"
                style={{ color: T.mutedText }}>
                <ExtLinkIcon />
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
  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg">

        <CardHeader />

        {/* Step pills */}
        <div className="flex items-center gap-0 border-b px-12 py-4" style={{ borderColor: '#f0f0f0' }}>
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex items-center">
              <div className="flex items-center gap-1.5">
                <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-bold"
                  style={s.done
                    ? { background: T.green, color: '#0a0a0a' }
                    : { background: '#ebebeb', color: '#999' }}>
                  {s.done ? '✓' : i + 1}
                </div>
                <span className="text-[11px] font-semibold"
                  style={{ color: s.done ? T.primaryText : '#aaa' }}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && <div className="mx-3 h-px w-7" style={{ background: '#e8e8e8' }} />}
            </div>
          ))}
        </div>

        {/* ── Form body — space-y-8 strict vertical rhythm ── */}
        <div className="space-y-8 px-12 py-10">

          {/* Section A: inputs */}
          <div className="space-y-6">

            {/* Recipient */}
            <FormField label="Recipient Wallet">
              <input
                type="text"
                placeholder="0x… EVM address on Arc"
                value={recipient}
                onChange={e => setRecipient(e.target.value.trim())}
                spellCheck={false}
                disabled={isWorking}
                className={[
                  inputShell, 'font-mono text-[12px]',
                  recipient && !recipientValid
                    ? 'border-red-300 focus:border-red-400'
                    : recipientValid
                    ? 'border-emerald-300 focus:border-emerald-400'
                    : `border-[${T.borderIdle}] focus:border-[${T.borderFocus}]`,
                ].join(' ')}
                style={{ color: T.primaryText, borderColor: recipientValid ? '#86efac' : recipient && !recipientValid ? '#fca5a5' : T.borderIdle }}
              />
              {recipient && !recipientValid && (
                <p className="mt-1.5 text-[11px] font-medium text-red-400">
                  Enter a valid EVM address
                </p>
              )}
            </FormField>

            {/* Amount — flex input-group */}
            <FormField label="Total Amount">
              <div className="flex overflow-hidden rounded-xl border-2 bg-white transition-colors focus-within:border-[#00FF41]"
                style={{ borderColor: T.borderIdle }}>
                <input
                  type="number"
                  placeholder="0.00"
                  min="0" step="any"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  disabled={isWorking}
                  className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[14px] font-semibold focus:outline-none disabled:opacity-50"
                  style={{ color: T.primaryText }}
                />
                <div className="flex items-center border-l-2 px-4"
                  style={{ borderColor: '#ebebeb', background: T.bgSurface }}>
                  <span className="select-none text-[12px] font-bold" style={{ color: T.labelColor }}>
                    USDC
                  </span>
                </div>
              </div>
              {isConnected && isOnArc && usdcBalance !== undefined && (
                <p className="mt-1.5 text-[11px]" style={{ color: T.mutedText }}>
                  Balance:{' '}
                  <span className="font-semibold" style={{ color: T.primaryText }}>
                    {formatUsdcFull(usdcBalance)} USDC
                  </span>
                  {insufficientFunds && (
                    <span className="ml-2 font-semibold text-red-500">— insufficient</span>
                  )}
                </p>
              )}
            </FormField>

            {/* Duration — chip row + custom, same rounded-xl as inputs */}
            <FormField label="Duration">
              <div className="space-y-2.5">
                <div className="flex flex-wrap gap-2">
                  {DURATIONS.map(d => {
                    const active = durationPreset === d.secs
                    return (
                      <button
                        key={d.label}
                        type="button"
                        disabled={isWorking}
                        onClick={() => { setDurationPreset(d.secs); setCustomDays('') }}
                        className="rounded-xl border-2 px-4 py-2.5 text-[12px] font-semibold transition-all disabled:opacity-50"
                        style={active
                          ? { background: T.green, borderColor: T.green, color: T.primaryText }
                          : { background: 'transparent', borderColor: T.borderIdle, color: T.labelColor }}
                      >
                        {d.label}
                      </button>
                    )
                  })}
                </div>
                {/* Custom days — same rounded-xl border-2 shell */}
                <div className="flex overflow-hidden rounded-xl border-2 bg-white transition-colors focus-within:border-[#00FF41]"
                  style={{ borderColor: durationPreset === null && customDays ? T.borderFocus : T.borderIdle }}>
                  <input
                    type="number"
                    placeholder="Custom days"
                    min="0.1" step="0.1"
                    value={customDays}
                    disabled={isWorking}
                    onChange={e => { setCustomDays(e.target.value); setDurationPreset(null) }}
                    className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[13px] font-medium focus:outline-none disabled:opacity-50 placeholder:font-normal placeholder:text-gray-300"
                    style={{ color: T.primaryText }}
                  />
                  <div className="flex items-center border-l-2 px-4"
                    style={{ borderColor: '#ebebeb', background: T.bgSurface }}>
                    <span className="select-none text-[12px] font-bold" style={{ color: T.labelColor }}>
                      DAYS
                    </span>
                  </div>
                </div>
              </div>
            </FormField>

            {/* Reason — same rounded-xl border-2 shell as Amount */}
            <FormField label="Reason for Stream">
              <div className="flex overflow-hidden rounded-xl border-2 bg-white transition-colors focus-within:border-[#00FF41]"
                style={{ borderColor: T.borderIdle }}>
                <input
                  type="text"
                  placeholder="e.g., April Salary, Freelance Gig…"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  disabled={isWorking}
                  maxLength={80}
                  className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[13px] font-medium focus:outline-none disabled:opacity-50 placeholder:font-normal placeholder:text-gray-300"
                  style={{ color: T.primaryText }}
                />
              </div>
            </FormField>
          </div>

          {/* Section B: CTA group */}
          <div className="space-y-3">

            {/* Not connected */}
            {!isConnected && (
              <button
                onClick={() => openConnectModal?.()}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold transition-all active:scale-[0.98]"
                style={{ background: T.green, color: T.primaryText }}
              >
                <WalletIcon />
                Connect Wallet
              </button>
            )}

            {/* Wrong network */}
            {isConnected && !isOnArc && (
              <button
                onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: T.primaryText }}
              >
                Switch to Arc Network
              </button>
            )}

            {/* Deploy + Power row */}
            {isConnected && isOnArc && (
              <div className="flex items-center justify-center gap-2.5">
                {/* Deploy — 70% of card width, centered */}
                <button
                  onClick={handleDeploy}
                  disabled={!deployReady}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold transition-all active:scale-[0.98]"
                  style={{
                    background: T.green,
                    color:      T.primaryText,
                    opacity:    deployReady ? 1 : 0.38,
                    cursor:     deployReady ? 'pointer' : 'not-allowed',
                    maxWidth:   '70%',
                  }}
                >
                  {isWorking ? <><Spinner />{statusMsg}</> : 'Deploy Stream'}
                </button>

                {/* Power / disconnect — square ash-grey outlined box */}
                <button
                  onClick={() => disconnect()}
                  title="Disconnect wallet"
                  className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-xl border-2 transition-all hover:border-red-300 hover:text-red-400 active:scale-[0.96]"
                  style={{ borderColor: T.borderIdle, color: T.mutedText }}
                >
                  <PowerIcon />
                </button>
              </div>
            )}

            {/* Sub-line feedback */}
            {isWorking && (
              <p className="text-center text-[11px] font-medium" style={{ color: T.mutedText }}>
                {step === 'funding' ? 'Step 1 of 2 — funding vault' : 'Step 2 of 2 — deploying contract'}
              </p>
            )}
            {!isWorking && insufficientFunds && (
              <p className="text-center text-[12px] font-semibold text-red-500">
                Insufficient USDC — fund your Arc wallet first
              </p>
            )}
            {!isWorking && isConnected && isOnArc && !insufficientFunds && (
              <p className="text-center text-[11px]" style={{ color: '#ccc' }}>
                2 wallet signatures required — fund vault, then deploy
              </p>
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

// ── Shared sub-components ──────────────────────────────────────────────────────

function CardHeader() {
  return (
    <div className="flex items-center justify-between border-b px-12 py-5"
      style={{ borderColor: '#f0f0f0' }}>
      <div className="flex items-center gap-2">
        <Logomark />
        <span className="text-[13px] font-bold uppercase tracking-[0.18em]"
          style={{ color: '#0a0a0a' }}>
          StreamPay
        </span>
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: '#6b6b6b' }}>
        New Stream
      </span>
    </div>
  )
}

function CardFooter() {
  return (
    <div className="flex items-center justify-center gap-2 border-t py-3.5"
      style={{ borderColor: '#f4f4f4', background: '#fafafa' }}>
      <img src="/hash-logo.png" alt="" className="h-3.5 w-3.5 opacity-25" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-300">
        Powered by Hash PayLink
      </span>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-3 block text-[11px] font-bold uppercase tracking-[0.1em]"
        style={{ color: '#333333' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function PowerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
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
    <svg className="mr-1.5 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
